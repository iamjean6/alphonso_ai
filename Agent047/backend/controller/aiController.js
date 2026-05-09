import axios from 'axios';
import FormData from 'form-data';
import User from '../model/user.js';
import Session from '../model/session.js';
import Message from '../model/message.js';
import { parseAlphonsoResponse } from '../utils/parser.js';
import { getSignedUrl } from '../utils/gcs.js';
import { pushMessage, getUserProfile, setUserProfile } from '../cache/query.js';

// 1. CHAT RELAY (The Streamer)
export const chatWithAi = async (req, res) => {
    try {
        const { message, session_id, active_sport } = req.body;
        const { uid, email } = req.user; // uid might be missing in older tokens

        // Safe Session ID fallback
        const finalSessionId = session_id || `fallback-${Date.now()}`;

        // --- IDENTITY RESILIENCE ---
        const userIdForAi = uid || email;

        // 1. READ-THROUGH CACHE: Check Redis for athlete profile
        let athlete = await getUserProfile(userIdForAi);
        
        if (!athlete) {
            console.log(`[Elite Cache] Profile Miss for ${userIdForAi}. Fetching from DB...`);
            athlete = await User.findOne({
                $or: [{ uid: userIdForAi }, { email: userIdForAi }]
            });
            
            if (athlete) {
                // HYDRATE: Store a simplified profile for the AI
                const profileToCache = {
                    weight: athlete.weight?.toString() || "",
                    height: athlete.height?.toString() || "",
                    goals: athlete.goals || "",
                    primarySports: athlete.primarySports?.join(', ') || ""
                };
                setUserProfile(userIdForAi, profileToCache);
            }
        } else {
            console.log(`[Elite Cache] Profile Hit for ${userIdForAi}`);
        }

        let athleteBio = null;
        if (athlete && athlete.weight) {
            athleteBio = `Athlete Stats: Weight ${athlete.weight}kg, Height ${athlete.height}cm. Goals: ${athlete.goals || 'General performance'}. Primary Sports: ${Array.isArray(athlete.primarySports) ? athlete.primarySports.join(', ') : athlete.primarySports}`;
        }

        // Atomic Session Record
        await Session.findOneAndUpdate(
            { sessionId: finalSessionId },
            {
                uid: userIdForAi,
                lastMessage: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
                $setOnInsert: { title: "New Performance Chat" }
            },
            { upsert: true }
        );

        // PERSIST USER MESSAGE
        const userMsg = {
            sessionId: finalSessionId,
            uid: userIdForAi,
            role: 'user',
            content: message
        };

        // Fire-and-forget: Redis (Fast) and MongoDB (Async)
        pushMessage(finalSessionId, userMsg);
        Message.create(userMsg).catch(err => console.error("[DB] User message persist failed:", err));

        // Call Python FastAPI server with streaming enabled
        const response = await axios({
            method: 'post',
            url: `${process.env.AI_SERVER_URL}/chat`,
            headers: {
                'X-Internal-Token': process.env.INTERNAL_API_KEY,
                'Content-Type': 'application/json'
            },
            data: {
                message,
                user_id: userIdForAi,
                session_id: finalSessionId, 
                active_sport,
                athlete_bio: athleteBio,
                tier: req.user?.tier || 'ELITE' // <-- The Tier Key
            },
            responseType: 'stream'

            
        });

        // Set headers for SSE (Server-Sent Events)
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // BACKGROUND: Buffer and Persist for DB
        let fullResponse = "";
        let sessionImages = []; // Array of {url, filename}
        
        response.data.on('data', async (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                
                // Pass the raw line to frontend first so text flows smoothly
                res.write(`${line}\n\n`);

                if (line.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(line.slice(6));
                        if (json.type === 'content' && json.chunk) {
                            fullResponse += json.chunk;
                            
                            // Detect [GRAPH_FILE: plot_N.png]
                            const graphMatch = json.chunk.match(/\[GRAPH_FILE:\s*(plot_\d+\.png)\]/);
                            if (graphMatch) {
                                const filename = graphMatch[1];
                                console.log(`[Elite Lab] Detected Graph: ${filename}`);
                                
                                // NON-BLOCKING: Fire and forget the signing so it doesn't choke the text stream
                                (async () => {
                                    try {
                                        const signedUrl = await getSignedUrl(finalSessionId, filename);
                                        const imageEvent = {
                                            type: 'image',
                                            url: signedUrl,
                                            filename: filename
                                        };
                                        res.write(`data: ${JSON.stringify(imageEvent)}\n\n`);
                                        sessionImages.push(imageEvent);
                                    } catch (err) {
                                        console.error(`Async Signing Error for ${filename}:`, err);
                                    }
                                })();
                            }
                        }
                    } catch (e) {
                        // Skip malformed chunks
                    }
                }
            }
        });

        response.data.on('end', async () => {
            try {
                const { cleanedText, videos } = parseAlphonsoResponse(fullResponse);
                const assistantMsg = {
                    sessionId: finalSessionId,
                    uid: userIdForAi,
                    role: 'assistant',
                    content: cleanedText || (sessionImages.length > 0 ? "Visual Data Deconstruction" : (videos.length > 0 ? "Video Scouting Report" : "")),
                    rawContent: fullResponse,
                    videos,
                    images: sessionImages
                };

                // Sync to Hot Cache (Redis)
                pushMessage(finalSessionId, assistantMsg);

                // Persist to Archive (MongoDB)
                await Message.create(assistantMsg);
                
                console.log(`[Elite Cache] Persisted AI response for session ${finalSessionId}.`);
            } catch (dbErr) {
                console.error("[DB/Cache] Failed to persist AI response:", dbErr.message);
            }
        });

    } catch (error) {
        console.error("Chat Relay Error:", error.message);
        if (error.response) {
            console.error("Python Server Response Error Data:", error.response.data);
            console.error("Python Server Status:", error.response.status);
        }
        res.status(500).json({ message: "AI Service temporarily unavailable." });
    }
};

// 2. GET UPLOAD URL (The Gateway to Direct GCS)
// BTS: Instead of handling the file, we get a 'Master Key' for the athlete.
export const getUploadUrl = async (req, res) => {
    try {
        const { filename, content_type, session_id } = req.body;
        const { uid } = req.user;

        if (!filename) {
            return res.status(400).json({ message: "Filename is required." });
        }

        // BTS: We call Python to generate the GCS Signed URL.
        // We use Headers to pass session metadata (Secure & Hidden from URL)
        const response = await axios.post(`${process.env.AI_SERVER_URL}/get_upload_url`, {}, {
            params: { filename, content_type },
            headers: {
                'X-Internal-Token': process.env.INTERNAL_API_KEY,
                'X-User-ID': uid,
                'X-Session-ID': session_id
            }
        });

        // Step 2: Send the 'Master Key' back to the Frontend
        res.status(200).json(response.data);
        console.log(`[Elite Lab] Signed URL issued for: ${filename}`);

    } catch (error) {
        console.error("Signed URL Relay Error:", error.message);
        res.status(500).json({ message: "Failed to generate upload gateway." });
    }
};
