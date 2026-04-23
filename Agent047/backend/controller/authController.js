import User from '../model/user.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_dev_secret_key_change_me_in_production';

/**
 * SIGNUP / REGISTER
 */
export const register = async (req, res) => {
    try {
        const { email, password, username } = req.body;

        // 1. Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "An athlete with this email already exists." });
        }

        // 2. Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // 3. Create initial user
        // We set 'uid' same as 'email' for now, or just leave it for DB _id
        const newUser = await User.create({
            email,
            password: hashedPassword,
            username: username || email.split('@')[0],
            uid: email // Simple mapping for AI service consistency
        });

        // 4. Generate Token
        const token = jwt.sign(
            { email: newUser.email, uid: newUser.uid },
            JWT_SECRET,
            { expiresIn: '8hrs' }
        );

        res.status(201).json({
            message: "Athlete registered successfully!",
            token,
            user: { email: newUser.email, username: newUser.username }
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

        // 1. Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: "Invalid credentials." });
        }

        // 2. Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials." });
        }

        // 3. Generate Token
        const token = jwt.sign(
            { email: user.email, uid: user.uid },
            JWT_SECRET,
            { expiresIn: '2hrs' }
        );

        res.status(200).json({
            token,
            user: { email: user.email, username: user.username, isPro: user.isPro }
        });

    } catch (error) {
        console.error("Login Error:", error.message);
        res.status(500).json({ message: "Server error during login." });
    }
};


export const user = async (req, res) => {
    try {
        // We use req.user.email populated by authMiddleware for security
        const authenticatedUser = await User.findOne({ email: req.user.email });

        if (!authenticatedUser) {
            return res.status(404).json({ message: "Athlete not found." });
        }

        res.status(200).json({
            user: {
                email: authenticatedUser.email,
                username: authenticatedUser.username,
                isPro: authenticatedUser.isPro,
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
