import Session from '../model/session.js';

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

        res.status(200).json({ message: "Session deleted successfully." });
    } catch (error) {
        console.error("Error deleting session:", error.message);
        res.status(500).json({ message: "Failed to delete session." });
    }
};
