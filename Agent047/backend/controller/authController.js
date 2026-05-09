import User from '../model/user.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { checkUsernameExists, addUsernameToBloom } from '../cache/query.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your_dev_secret_key_change_me_in_production';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'your_refresh_secret_key_change_me';

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
        const { email, password, username } = req.body;
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
            user: { email: newUser.email, username: newUser.username, tier: newUser.tier }
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

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: "Invalid credentials." });
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
            user: { email: user.email, username: user.username, tier: user.tier }
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
                height: authenticatedUser.height,
                weight: authenticatedUser.weight,
                primarySports: authenticatedUser.primarySports
            }
        });
    } catch (error) {
        console.error("Fetch current user error:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
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
