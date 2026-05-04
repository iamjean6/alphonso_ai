import express from 'express';
import cors from 'cors'
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import morgan from 'morgan';

// Middlewares
import authMiddleware from './middleware/auth.js';
import checkUsage from './middleware/usage.js';

// Controllers
import { chatWithAi, getUploadUrl } from './controller/aiController.js';
import { updateProfile } from './controller/profiles.js';
import { listSessions, deleteSession, getSessionMessages } from './controller/sessionController.js';
import { mpesaCallback, paystackWebhook } from './controller/paymentController.js';
import { login, register, user } from './controller/authController.js';

dotenv.config();

const app = express();

// Custom Morgan Token for AI Context Latency (TTFB)
morgan.token('context-latency', (req, res) => {
    if (!req._startTime || !res._header) return '-';
    const duration = Date.now() - req._startTime;
    return `${duration}ms`;
});

// Initialize Morgan with a professional coaching format
app.use(morgan((tokens, req, res) => {
    return [
        `[${new Date().toISOString()}]`,
        tokens.method(req, res),
        tokens.url(req, res),
        tokens.status(req, res),
        `Delay: ${tokens['context-latency'](req, res)}`,
        `Total: ${tokens['response-time'](req, res)}ms`,
        '|',
        tokens['remote-addr'](req, res)
    ].join(' ');
}));

app.use(cors());
app.use(express.json());


// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.log("MongoDB connection error: ", err));

// 2. ROUTES
app.get("/home", (req, res) => {
    res.send("The server is running")
})

// SECURE AI ROUTES
// Flow: Auth -> Usage Check (2-try) -> AI Controller (Stream/Relay)
app.post("/chat", authMiddleware, checkUsage, chatWithAi);
app.post("/get-upload-url", authMiddleware, checkUsage, getUploadUrl);

// AUTH ROUTES (Public)
app.post("/api/auth/signup", register);
app.post("/api/auth/login", login);
app.get("/api/auth/user", authMiddleware, user);

// Flow: Auth -> Usage Check -> Profile Update
app.post("/update-profile", authMiddleware, updateProfile);

// SESSION ROUTES
app.get("/sessions", authMiddleware, listSessions);
app.get("/sessions/:id/messages", authMiddleware, getSessionMessages);
app.delete("/sessions/:id", authMiddleware, deleteSession);

// PAYMENT CALLBACKS (Public)
app.post("/api/payments/mpesa-callback", mpesaCallback);
app.post("/api/payments/paystack-webhook", paystackWebhook);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
})
