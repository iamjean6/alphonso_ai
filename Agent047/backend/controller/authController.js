import User from '../model/user.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { checkUsernameExists, addUsernameToBloom, saveOTP, verifyOTP } from '../cache/query.js';
import { generateOTP, sendVerificationEmail } from '../utils/resend.js';

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;

if (!JWT_SECRET || !REFRESH_SECRET) {
    throw new Error("Critical: JWT_SECRET or REFRESH_SECRET environment variable is missing.");
}

/**
 * Token Helpers
 */
const generateAccessToken = (user) => {
    return jwt.sign(
        { email: user.email, uid: user.uid },
        JWT_SECRET,
        { expiresIn: '15m' } // Short-lived
    );
};

const generateRefreshToken = (user) => {
    return jwt.sign(
        { email: user.email, uid: user.uid },
        REFRESH_SECRET,
        { expiresIn: '7d' } // Long-lived
    );
};

const sendRefreshToken = (res, token) => {
    res.cookie('refreshToken', token, {
        httpOnly: true,
        path: '/api/auth/refresh', // Only send to refresh endpoint
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
};

/**
 * SIGNUP / REGISTER
 */
export const register = async (req, res) => {
    try {
        const { email, password, username, otp } = req.body;
        
        if (!otp) return res.status(400).json({ message: "Verification code is required." });

        // 0. VERIFY OTP (Fast Redis Check)
        const otpCheck = await verifyOTP(email, otp);
        if (!otpCheck.valid) {
            const errorMsg = otpCheck.reason === "EXPIRED" ? "Code expired. Please request a new one." : "Invalid verification code.";
            return res.status(400).json({ message: errorMsg });
        }
        const finalUsername = username || email.split('@')[0];

        // 1. Bloom Filter Check (Fast)
        const isTakenMaybe = await checkUsernameExists(finalUsername);
        
        if (isTakenMaybe) {
            // Only hit DB if Bloom Filter says "Maybe"
            const userWithUsername = await User.findOne({ username: finalUsername });
            if (userWithUsername) {
                return res.status(400).json({ message: "This username is already taken." });
            }
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "An athlete with this email already exists." });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const newUser = await User.create({
            email,
            password: hashedPassword,
            username: finalUsername,
            uid: email
        });

        // 2. Sync to Bloom Filter for future checks
        await addUsernameToBloom(finalUsername);

        const accessToken = generateAccessToken(newUser);
        const refreshToken = generateRefreshToken(newUser);

        // Store refresh token in DB
        newUser.refreshToken = refreshToken;
        await newUser.save();

        sendRefreshToken(res, refreshToken);

        res.status(201).json({
            message: "Athlete registered successfully!",
            token: accessToken,
            user: { 
                email: newUser.email, 
                username: newUser.username, 
                tier: newUser.tier,
                height: newUser.height,
                weight: newUser.weight,
                primarySports: newUser.primarySports,
                chatsToday: newUser.chatsToday || 0
            }
        });

    } catch (error) {
        console.error("Signup Error:", error.message);
        res.status(500).json({ message: "Server error during registration." });
    }
};

/**
 * LOGIN
 */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Identity Resilience: Search by Email OR Username
        const user = await User.findOne({
            $or: [
                { email: email },
                { username: email } // In case the user typed their username in the email field
            ]
        });

        if (!user) {
            return res.status(401).json({ message: "No athlete found with those credentials." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials." });
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Update refresh token in DB
        user.refreshToken = refreshToken;
        await user.save();

        sendRefreshToken(res, refreshToken);

        res.status(200).json({
            token: accessToken,
            user: { 
                email: user.email, 
                username: user.username, 
                tier: user.tier,
                height: user.height,
                weight: user.weight,
                primarySports: user.primarySports,
                chatsToday: user.chatsToday || 0
            }
        });

    } catch (error) {
        console.error("Login Error:", error.message);
        res.status(500).json({ message: "Server error during login." });
    }
};

/**
 * REFRESH TOKEN
 */
export const refresh = async (req, res) => {
    const token = req.cookies.refreshToken;
    if (!token) return res.status(401).json({ message: "Refresh token missing" });

    try {
        const decoded = jwt.verify(token, REFRESH_SECRET);
        const user = await User.findOne({ email: decoded.email });

        if (!user || user.refreshToken !== token) {
            return res.status(403).json({ message: "Invalid refresh token" });
        }

        const accessToken = generateAccessToken(user);
        res.json({ token: accessToken });
    } catch (error) {
        console.error("Refresh Error:", error.message);
        res.status(403).json({ message: "Invalid or expired refresh token" });
    }
};

/**
 * LOGOUT
 */
export const logout = async (req, res) => {
    const token = req.cookies.refreshToken;
    if (token) {
        const user = await User.findOne({ refreshToken: token });
        if (user) {
            user.refreshToken = null;
            await user.save();
        }
    }
    res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
    res.status(200).json({ message: "Logged out successfully" });
};

export const user = async (req, res) => {
    try {
        const authenticatedUser = await User.findOne({ email: req.user.email });

        if (!authenticatedUser) {
            return res.status(404).json({ message: "Athlete not found." });
        }

        res.status(200).json({
            user: {
                email: authenticatedUser.email,
                username: authenticatedUser.username,
                tier: authenticatedUser.tier,
                chatsToday: authenticatedUser.chatsToday,
                uploadsToday: authenticatedUser.uploadsToday,
                height: authenticatedUser.height,
                weight: authenticatedUser.weight,
                primarySports: authenticatedUser.primarySports,
                hasGoogleCalendar: !!authenticatedUser.googleRefreshToken,
                userTimezone: authenticatedUser.userTimezone
            }
        });
    } catch (error) {
        console.error("Fetch current user error:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * GOOGLE CALENDAR OAUTH
 */
import { OAuth2Client } from 'google-auth-library';

export const googleCalendarAuth = async (req, res) => {
    try {
        const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
        const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
        const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
        const GOOGLE_REDIRECT_URI = `${BACKEND_URL}/api/auth/google/calendar/callback`;

        const oauth2Client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: ['https://www.googleapis.com/auth/calendar'],
            state: req.user.email,
            redirect_uri: GOOGLE_REDIRECT_URI
        });
        res.json({ url });
    } catch (err) {
        console.error("Generate Auth URL error:", err);
        res.status(500).json({ message: "Failed to generate Google Auth URL" });
    }
};

export const googleCalendarCallback = async (req, res) => {
    try {
        const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
        const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
        const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
        const GOOGLE_REDIRECT_URI = `${BACKEND_URL}/api/auth/google/calendar/callback`;

        const { code, state } = req.query;
        if (!code || !state) return res.status(400).send("Authorization failed: Missing code or state.");

        const oauth2Client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
        const { tokens } = await oauth2Client.getToken(code);

        const userEmail = state;
        const updateData = {
            googleAccessToken: tokens.access_token,
            googleTokenExpiry: tokens.expiry_date
        };
        if (tokens.refresh_token) {
            updateData.googleRefreshToken = tokens.refresh_token;
        }

        await User.findOneAndUpdate({ email: userEmail }, updateData);

        const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${FRONTEND_URL}/chat`);
    } catch (err) {
        console.error("Google Calendar Callback error:", err);
        res.status(500).send("Failed to authenticate with Google Calendar.");
    }
};

/**
 * UPDATE USER TIMEZONE
 */
export const updateTimezone = async (req, res) => {
    try {
        const { timezone } = req.body;
        if (!timezone) return res.status(400).json({ message: "Timezone is required." });

        const User = (await import('../model/user.js')).default;
        await User.findByIdAndUpdate(req.user.id, { userTimezone: timezone });
        res.status(200).json({ message: "Timezone updated successfully." });
    } catch (err) {
        console.error("Update Timezone error:", err);
        res.status(500).json({ message: "Failed to update timezone." });
    }
};

/**
 * INSTANT USERNAME CHECK
 * Used by the frontend for real-time signup validation.
 */
export const checkUsername = async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) return res.status(400).json({ message: "Username is required." });

        const isTaken = await checkUsernameExists(username);
        
        // If "Maybe Taken", do a final DB check to be 100% sure
        if (isTaken) {
            const user = await User.findOne({ username });
            return res.status(200).json({ available: !user });
        }

        // If Bloom says "No", it's 100% available
        res.status(200).json({ available: true });

    } catch (error) {
        res.status(500).json({ message: "Check failed." });
    }
};

/**
 * REQUEST OTP
 * Generates and sends a code to the user's email.
 */
export const requestOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email is required." });

        // 1. Generate 6-digit code
        const otp = generateOTP();

        // 2. Store in Redis (5 min expiry)
        const saved = await saveOTP(email, otp);
        if (!saved) throw new Error("Failed to store OTP");

        // 3. Send Email via Resend
        const emailResult = await sendVerificationEmail(email, otp);
        if (!emailResult.success) {
            return res.status(500).json({ message: "Failed to send verification email." });
        }

        res.status(200).json({ message: "Verification code sent to your email." });

    } catch (error) {
        console.error("[OTP Request Error]", error.message);
        res.status(500).json({ message: "Unable to send verification code." });
    }
};
