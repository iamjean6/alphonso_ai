import Session from '../model/session.js';
import Message from '../model/message.js';
import { getSignedUrl } from '../utils/gcs.js';

/**
 * Returns a list of all chat sessions belonging to the logged-in athlete.
 */
export const listSessions = async (req, res) => {
    try {
        const { uid } = req.user;

        // Find sessions for this user, sorted by the most recently updated
        const sessions = await Session.find({ uid })
            .sort({ updatedAt: -1 });

        res.status(200).json(sessions);

    } catch (error) {
        console.error("Error listing sessions:", error.message);
        res.status(500).json({ message: "Unable to retrieve chat history." });
    }
};

/**
 * Deletes a specific session.
 */
export const deleteSession = async (req, res) => {
    try {
        const { id } = req.params; // The sessionId
        const { uid } = req.user;

        const result = await Session.deleteOne({ sessionId: id, uid });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Session not found or unauthorized." });
        }

        // Cascade delete messages
        await Message.deleteMany({ sessionId: id, uid });

        res.status(200).json({ message: "Session deleted successfully." });
    } catch (error) {
        console.error("Error deleting session:", error.message);
        res.status(500).json({ message: "Failed to delete session." });
    }
};

/**
 * Returns all messages for a specific session.
 */
export const getSessionMessages = async (req, res) => {
    try {
        const { id } = req.params; // The sessionId
        const { uid } = req.user;

        const messages = await Message.find({ sessionId: id, uid })
            .sort({ timestamp: 1 });

        // DYNAMIC SIGNING: Regenerate expired GCS URLs for history
        const hydratedMessages = await Promise.all(messages.map(async (msg) => {
            if (msg.images && msg.images.length > 0) {
                const signedImages = await Promise.all(msg.images.map(async (img) => {
                    if (img.filename) {
                        try {
                            const url = await getSignedUrl(id, img.filename);
                            // Return a plain object with the fresh URL
                            const imgObj = img.toObject ? img.toObject() : img;
                            return { ...imgObj, url };
                        } catch (e) {
                            console.error(`Failed to re-sign ${img.filename}:`, e);
                            return img;
                        }
                    }
                    return img;
                }));
                const msgObj = msg.toObject ? msg.toObject() : msg;
                return { ...msgObj, images: signedImages };
            }
            return msg;
        }));

        res.status(200).json(hydratedMessages);
    } catch (error) {
        console.error("Error fetching messages:", error.message);
        res.status(500).json({ message: "Unable to load conversation history." });
    }
};
