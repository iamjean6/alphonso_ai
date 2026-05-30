import jwt from 'jsonwebtoken';

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "No token provided. Authorization denied." });
    }

    const token = authHeader.split(' ')[1];

    try {
        if (!process.env.JWT_SECRET) {
            throw new Error("Critical: JWT_SECRET environment variable is missing.");
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Should contain the 'uid'
        next();
    } catch (error) {
        console.error("Auth Middleware Error:", error.message);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                message: "Session expired. Please re-login to continue syncing your lab data.",
                code: "TOKEN_EXPIRED" 
            });
        }
        res.status(401).json({ message: "Authentication failed. Invalid token." });
    }
};

export default authMiddleware;
