import Session from '../model/session.js';
import Message from '../model/message.js';
import { getSignedUrl } from '../utils/gcs.js';
import { getHistory, pushMessage, deleteSessionCache, bulkPushMessages, getUserSessionList, setUserSessionList } from '../cache/query.js';

/**
 * Returns a list of all chat sessions belonging to the logged-in athlete.
 */
export const listSessions = async (req, res) => {
    try {
        const { uid, email, username } = req.user;
        const queryUid = username || email || uid;

        // 1. READ-THROUGH CACHE: Check Redis first
        const cachedList = await getUserSessionList(queryUid);
        if (cachedList) {
            console.log(`[Elite Cache] Session List Hit for ${queryUid}`);
            return res.status(200).json(cachedList);
        }

        // 2. CACHE MISS: Fetch from MongoDB
        console.log(`[Elite Cache] Session List Miss. Fetching from DB...`);
        const sessions = await Session.find({ uid: queryUid })
            .sort({ updatedAt: -1 });

        // 3. HYDRATION: Prime Redis
        if (sessions.length > 0) {
            await setUserSessionList(queryUid, sessions);
        }

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
        const { uid, email, username } = req.user;
        const queryUid = username || email || uid;

        const result = await Session.deleteOne({ sessionId: id, uid: queryUid });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Session not found or unauthorized." });
        }

        // Cascade delete messages
        await Message.deleteMany({ sessionId: id, uid: queryUid });

        // EXPLICIT INVALIDATION: Purge from Redis RAM (including list)
        await deleteSessionCache(id, queryUid);

        res.status(200).json({ message: "Session deleted successfully." });
    } catch (error) {
        console.error("Error deleting session:", error.message);
        res.status(500).json({ message: "Unable to delete session." });
    }
};

/**
 * Toggles the star/favorite status of a session.
 */
export const toggleStarSession = async (req, res) => {
    try {
        const { id } = req.params; // The sessionId
        const { uid, email, username } = req.user;
        const queryUid = username || email || uid;
        const { isStarred } = req.body;

        const session = await Session.findOneAndUpdate(
            { sessionId: id, uid: queryUid },
            { $set: { isStarred: isStarred } },
            { new: true, upsert: true }
        );

        // Invalidate the session list cache so the updated star status is fetched next time
        await deleteSessionCache(id, queryUid);

        res.status(200).json({ message: "Session star status updated.", session });
    } catch (error) {
        console.error("Error toggling star status:", error.message);
        res.status(500).json({ message: "Unable to update session." });
    }
};

/**
 * Returns all messages for a specific session.
 */
export const getSessionMessages = async (req, res) => {
    try {
        const { id } = req.params;
        const { uid, email, username } = req.user;
        const queryUid = username || email || uid;

        // 1. READ-THROUGH CACHE: Check Redis first
        const cachedMessages = await getHistory(id);
        if (cachedMessages) {
            console.log(`[Elite Cache] Hot-Read for session ${id}`);
            const session = await Session.findOne({ sessionId: id, uid: queryUid });
            const activeFlow = session ? session.activeFlow : 'research';
            const isStarred = session ? session.isStarred : false;
            return res.status(200).json({ messages: cachedMessages, activeFlow, isStarred });
        }

        // 2. CACHE MISS: Fallback to MongoDB
        console.log(`[Elite Cache] Cache Miss for session ${id}. Fetching from DB...`);
        const messages = await Message.find({ sessionId: id, uid: queryUid })
            .sort({ timestamp: 1 });

        // DYNAMIC SIGNING: Regenerate expired GCS URLs
        const hydratedMessages = await Promise.all(messages.map(async (msg) => {
            const msgObj = msg.toObject ? msg.toObject() : msg;
            if (msg.images && msg.images.length > 0) {
                const signedImages = await Promise.all(msg.images.map(async (img) => {
                    if (img.filename) {
                        try {
                            const url = await getSignedUrl(id, img.filename);
                            return { ...img, url };
                        } catch (e) {
                            return img;
                        }
                    }
                    return img;
                }));
                return { ...msgObj, images: signedImages };
            }
            return msgObj;
        }));

        // 3. HYDRATION: Prime Redis for the next request (Atomic Batch)
        if (hydratedMessages.length > 0) {
            await bulkPushMessages(id, hydratedMessages);
        }

        // 4. FETCH METADATA: Get the active flow from the session
        const session = await Session.findOne({ sessionId: id, uid: queryUid });
        const activeFlow = session ? session.activeFlow : 'research';
        const isStarred = session ? session.isStarred : false;

        res.status(200).json({ messages: hydratedMessages, activeFlow, isStarred });
    } catch (error) {
        console.error("Error fetching messages:", error.message);
        res.status(500).json({ message: "Unable to load conversation history." });
    }
};
