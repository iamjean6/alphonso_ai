import express from 'express';
import cors from 'cors'
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

// Middlewares
import authMiddleware from './middleware/auth.js';
import checkUsage from './middleware/usage.js';

// Controllers
import { chatWithAi, getUploadUrl, cancelChat } from './controller/aiController.js';
import { updateProfile } from './controller/profiles.js';
import { listSessions, deleteSession, getSessionMessages, toggleStarSession } from './controller/sessionController.js';
import { mpesaCallback, paystackWebhook } from './controller/paymentController.js';
import { login, register, user, refresh, logout, checkUsername, requestOTP, googleCalendarAuth, googleCalendarCallback, updateTimezone } from './controller/authController.js';
import { bootstrapCache } from './cache/bootstrap.js';
import { connectKafka } from './services/kafkaClient.js';
import paypalRoutes from './routes/paypal.js';

dotenv.config();

const app = express();

// 1. GLOBAL CORS CONFIGURATION (Must be at the top)
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(cookieParser());

// 2. LOGGING (Morgan)
// Custom Morgan Token for AI Context Latency (TTFB)
morgan.token('context-latency', (req, res) => {
    if (!req._startTime || !res._header) return '-';
    const duration = Date.now() - req._startTime;
    return `${duration}ms`;
});

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


// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log("Connected to MongoDB");
        // Warm up the Redis cache (Bloom Filter, etc.)
        await bootstrapCache();
        // Initialize Kafka Producer and Response Consumer
        await connectKafka();
    })
    .catch((err) => console.log("MongoDB connection error: ", err));

// 2. ROUTES
app.get("/home", (req, res) => {
    res.send("The server is running")
})

// SECURE AI ROUTES
// Flow: Auth -> Usage Check (2-try) -> AI Controller (Stream/Relay)
app.post("/chat", authMiddleware, checkUsage, chatWithAi);
app.post("/chat/cancel", authMiddleware, cancelChat);
app.post("/get-upload-url", authMiddleware, checkUsage, getUploadUrl);

// AUTH ROUTES (Public / Protected)
app.post("/api/auth/request-otp", requestOTP);
app.post("/api/auth/signup", register);
app.get("/api/auth/check-username", checkUsername);
app.post("/api/auth/login", login);
app.post("/api/auth/refresh", refresh);
app.post("/api/auth/logout", logout);
app.get("/api/auth/user", authMiddleware, user);
app.get("/api/auth/google/calendar", authMiddleware, googleCalendarAuth);
app.get("/api/auth/google/calendar/callback", googleCalendarCallback);
app.put("/api/auth/timezone", authMiddleware, updateTimezone);

// Flow: Auth -> Usage Check -> Profile Update
app.post("/update-profile", authMiddleware, updateProfile);

// SESSION ROUTES
app.get("/sessions", authMiddleware, listSessions);
app.get("/sessions/:id/messages", authMiddleware, getSessionMessages);
app.delete("/sessions/:id", authMiddleware, deleteSession);
app.patch("/sessions/:id/star", authMiddleware, toggleStarSession);

// PAYMENT CALLBACKS (Public)
app.post("/api/payments/mpesa-callback", mpesaCallback);
app.post("/api/payments/paystack-webhook", paystackWebhook);
app.use("/api/paypal", paypalRoutes);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
})
