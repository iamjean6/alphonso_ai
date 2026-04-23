import User from '../model/user.js';

const checkUsage = async (req, res, next) => {
    try {
        const { uid } = req.user; // Assumes authMiddleware has run and set req.user

        // Atomic search and increment
        let user = await User.findOne({ uid });

        if (!user) {
            user = await User.create({ uid });
        }

        // Check if user has an active subscription
        const isCurrentlyPro = user.isPro && user.proUntil && user.proUntil > new Date();

        if (isCurrentlyPro) {
            return next();
        }

        // If user is Free, check the limit (2 tries)
        if (user.usageCount >= 20) {
            return res.status(402).json({
                message: "Trial exhausted. Please subscribe to continue using Alphonso Expert coaching.",
                tries: user.usageCount
            });
        }

        // Increment usage count for the current request
        user.usageCount += 1;
        await user.save();

        next();
    } catch (error) {
        console.error("Usage Middleware Error:", error);
        res.status(500).json({ message: "Internal server error checking usage." });
    }
};

export default checkUsage;
