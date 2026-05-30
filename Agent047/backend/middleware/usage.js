import User from '../model/user.js';

const checkUsage = async (req, res, next) => {
    try {
        const { uid, email, username } = req.user;
        const queryUid = username || email || uid;

        let user = await User.findOne({
            $or: [{ email: email }, { username: email }, { uid: queryUid }]
        });

        if (!user) {
            return res.status(401).json({ message: "User profile not found." });
        }

        const tier = (user.tier || 'rookie').toLowerCase();
        
        // 1. Reset Daily Counters if a new day has started
        const today = new Date();
        const lastReset = new Date(user.lastUsageReset || 0);
        
        if (today.getDate() !== lastReset.getDate() || today.getMonth() !== lastReset.getMonth() || today.getFullYear() !== lastReset.getFullYear()) {
            user.chatsToday = 0;
            user.uploadsToday = 0;
            user.lastUsageReset = today;
            // Don't save yet, we will save at the end if the request is approved
        }

        const isUpload = req.path.includes("upload");

        // 2. Define Limits
        const limits = {
            rookie: { chats: 3, uploads: 0 },
            prospect: { chats: 10, uploads: 2 },
            elite: { chats: 20, uploads: 10 },
            legend: { chats: Infinity, uploads: Infinity }
        };

        const currentLimits = limits[tier] || limits.rookie;

        // 3. Enforce Limits
        if (isUpload) {
            if (user.uploadsToday >= currentLimits.uploads) {
                return res.status(429).json({
                    message: `Daily upload limit reached for ${tier} tier. Upgrade to process more data.`,
                    limit: currentLimits.uploads
                });
            }
            user.uploadsToday += 1;
        } else {
            if (user.chatsToday >= currentLimits.chats) {
                return res.status(429).json({
                    message: `Daily chat limit reached for ${tier} tier. Upgrade to unlock more insights.`,
                    limit: currentLimits.chats
                });
            }
            user.chatsToday += 1;
        }

        await user.save();
        next();
    } catch (error) {
        console.error("Usage Middleware Error:", error);
        res.status(500).json({ message: "Internal server error checking usage." });
    }
};

export default checkUsage;
