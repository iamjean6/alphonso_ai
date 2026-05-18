import axios from 'axios';
import FormData from 'form-data';
import User from '../model/user.js';
import Session from '../model/session.js';
import Message from '../model/message.js';
import { parseAlphonsoResponse } from '../utils/parser.js';
import { getSignedUrl } from '../utils/gcs.js';
import { pushMessage, getUserProfile, setUserProfile } from '../cache/query.js';
import { produceMessage, activeStreamSessions } from '../services/kafkaClient.js';
import redisSubscriber from '../cache/pubsub.js';

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

        // --- ASYNCHRONOUS KAFKA DECOUPLING ---
        // 1. Set headers for SSE (Server-Sent Events)
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Keep SSE connection alive across strict firewall / proxy rules with periodic comment heartbeats
        const heartbeatInterval = setInterval(() => {
            res.write(': ping\n\n');
        }, 15000);

        // 2. Register active SSE stream for final Kafka completion catch
        activeStreamSessions.set(finalSessionId, { res, heartbeatInterval });

        const streamChannel = `stream:${finalSessionId}`;

        // 3. Subscribe to Redis in-memory token stream
        await redisSubscriber.subscribe(streamChannel, (rawMessage) => {
            // Forward raw SSE chunk directly to frontend
            res.write(`${rawMessage}\n\n`);

            // Detect graph files in streaming chunk for dynamic signing
            if (rawMessage.startsWith('data: ')) {
                try {
                    const json = JSON.parse(rawMessage.slice(6));
                    if (json.type === 'content' && json.chunk) {
                        const graphMatch = json.chunk.match(/\[GRAPH_FILE:\s*(plot_\d+\.png)\]/);
                        if (graphMatch) {
                            const filename = graphMatch[1];
                            console.log(`[Elite Lab] Detected Graph in Stream: ${filename}`);
                            (async () => {
                                try {
                                    const signedUrl = await getSignedUrl(finalSessionId, filename);
                                    const imageEvent = {
                                        type: 'image',
                                        url: signedUrl,
                                        filename: filename
                                    };
                                    res.write(`data: ${JSON.stringify(imageEvent)}\n\n`);
                                } catch (err) {
                                    console.error(`Async Signing Error for ${filename}:`, err);
                                }
                            })();
                        }
                    }
                } catch (e) {}
            }

            if (rawMessage.includes('"status":"DONE"') || rawMessage.includes('"status":"ERROR"')) {
                redisSubscriber.unsubscribe(streamChannel);
            }
        });

        // 4. Handle client early disconnect
        req.on('close', async () => {
            clearInterval(heartbeatInterval);
            activeStreamSessions.delete(finalSessionId);
            try {
                await redisSubscriber.unsubscribe(streamChannel);
            } catch(e) {}
        });

        // 5. Fire Task Event to Kafka
        const taskPayload = {
            eventId: `evt_${Date.now()}`,
            timestamp: new Date().toISOString(),
            sessionId: finalSessionId,
            userId: userIdForAi,
            tier: req.user?.tier || 'ELITE',
            activeSport: active_sport || 'basketball',
            athleteBio,
            message
        };

        await produceMessage('ai-chat-requests', finalSessionId, taskPayload);

    } catch (error) {
        console.error("Chat Relay Error:", error.message);
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
