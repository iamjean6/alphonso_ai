import axios from 'axios';
import FormData from 'form-data';
import User from '../model/user.js';
import Session from '../model/session.js';

// 1. CHAT RELAY (The Streamer)
export const chatWithAi = async (req, res) => {
    try {
        const { message, session_id, active_sport } = req.body;
        const { uid, email } = req.user; // uid might be missing in older tokens

        // Safe Session ID fallback
        const finalSessionId = session_id || `fallback-${Date.now()}`;

        // --- IDENTITY RESILIENCE ---
        const userIdForAi = uid || email;

        // Pull athlete physical profile
        const athlete = await User.findOne({
            $or: [{ uid: userIdForAi }, { email: userIdForAi }]
        });

        let athleteBio = null;
        if (athlete && athlete.weight) {
            athleteBio = `Athlete Stats: Weight ${athlete.weight}kg, Height ${athlete.height}cm. Goals: ${athlete.goals || 'General performance'}. Primary Sports: ${athlete.primarySports.join(', ')}`;
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
                session_id: finalSessionId, // Send the safe ID to Python too
                active_sport,
                athlete_bio: athleteBio // <-- The "Secret Sauce"
            },
            responseType: 'stream'
        });

        // Set headers for SSE (Server-Sent Events)
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Pipe the stream directly from Python to our Frontend
        response.data.pipe(res);

    } catch (error) {
        console.error("Chat Relay Error:", error.message);
        if (error.response) {
            console.error("Python Server Response Error Data:", error.response.data);
            console.error("Python Server Status:", error.response.status);
        }
        res.status(500).json({ message: "AI Service temporarily unavailable." });
    }
};

// 2. STATS UPLOAD RELAY (The Artifact Hub)
export const uploadStats = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded." });
        }

        const { session_id } = req.body;
        const { uid } = req.user;

        // Construct a new form to send to Python
        const formData = new FormData();
        formData.append('file_upload', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
        });
        formData.append('user_id', uid);
        formData.append('session_id', session_id);

        const response = await axios.post(`${process.env.AI_SERVER_URL}/stats_upload`, formData, {
            headers: {
                ...formData.getHeaders(),
                'X-Internal-Token': process.env.INTERNAL_API_KEY
            }
        });

        res.status(200).json(response.data);
        console.log("Successfully uploaded file")

    } catch (error) {
        console.error("Upload Relay Error:", error.message);
        res.status(500).json({ message: "Failed to sync artifact with AI Service." });
    }
};
