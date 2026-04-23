import express from 'express';
import cors from 'cors'
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import multer from 'multer';

// Middlewares
import authMiddleware from './middleware/auth.js';
import checkUsage from './middleware/usage.js';

// Controllers
import { chatWithAi, uploadStats } from './controller/aiController.js';
import { updateProfile } from './controller/profiles.js';
import { listSessions, deleteSession } from './controller/sessionController.js';
import { mpesaCallback, paystackWebhook } from './controller/paymentController.js';
import { login, register, user } from './controller/authController.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// 1. Multer setup for temporary file handling
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

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

app.post("/upload", authMiddleware, checkUsage, upload.single('file_upload'), uploadStats);

// AUTH ROUTES (Public)
app.post("/api/auth/signup", register);
app.post("/api/auth/login", login);
app.get("/api/auth/user", authMiddleware, user);

// Flow: Auth -> Usage Check -> Profile Update
app.post("/update-profile", authMiddleware, updateProfile);

// SESSION ROUTES
app.get("/sessions", authMiddleware, listSessions);
app.delete("/sessions/:id", authMiddleware, deleteSession);

// PAYMENT CALLBACKS (Public)
app.post("/api/payments/mpesa-callback", mpesaCallback);
app.post("/api/payments/paystack-webhook", paystackWebhook);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
})
