import client from "./index.js";
import keys from "./keys.js";

/**
 * CHAT SESSION QUERIES
 * High-performance wrappers for managing the hot chat cache.
 */

const DEFAULT_TTL = 24 * 60 * 60; // 24 Hours
const MAX_HISTORY = 50;         // Keep the last 50 messages in RAM
const BLOOM_KEY = keys.USERNAME_BLOOM();


export const initUsernameBloom = async () => {
    try {
        const exists = await client.exists(BLOOM_KEY);
        if (!exists) {
            // BF.RESERVE {key} {error_rate} {capacity}
            await client.sendCommand(["BF.RESERVE", BLOOM_KEY, "0.001", "10000"]);
            console.log(`[Elite Cache] Bloom filter initialized: ${BLOOM_KEY}`);
        }
        return true;
    } catch (error) {
        // If error is "item already exists", that's fine
        if (error.message.includes("already exists")) return true;
        console.error(`[Redis] Bloom initialization failed:`, error.message);
        return false;
    }
};

/**
 * Adds a username to the filter
 */
export const addUsernameToBloom = async (username) => {
    try {
        if (!username) return false;
        await client.sendCommand(["BF.ADD", BLOOM_KEY, username.toLowerCase()]);
        return true;
    } catch (error) {
        console.error(`[Redis] Bloom Add failed:`, error.message);
        return false;
    }
};

/**
 * Checks if a username is in the filter
 * Returns true if MIGHT BE taken, false if DEFINITELY NOT taken.
 */
export const checkUsernameExists = async (username) => {
    try {
        if (!username) return false;
        const res = await client.sendCommand(["BF.EXISTS", BLOOM_KEY, username.toLowerCase()]);
        return res === 1; // 1 means exists, 0 means doesn't
    } catch (error) {
        console.error(`[Redis] Bloom Check failed:`, error.message);
        return true; // Fallback to "Maybe" to be safe
    }
};

export const pushMessage = async (sessionId, message) => {
    const key = keys.SESSION_MESSAGES(sessionId);
    try {
        const messageString = JSON.stringify(message);

        await client.multi()
            .rPush(key, messageString)
            .lTrim(key, -MAX_HISTORY, -1)
            .expire(key, DEFAULT_TTL)
            .exec();

        return true;
    } catch (error) {
        console.error(`[Redis] Error pushing message for ${sessionId}:`, error.message);
        return false;
    }
};

export const bulkPushMessages = async (sessionId, messages) => {
    const key = keys.SESSION_MESSAGES(sessionId);
    try {
        const messageStrings = messages.map(msg => JSON.stringify(msg));

        await client.multi()
            .rPush(key, messageStrings)
            .lTrim(key, -MAX_HISTORY, -1)
            .expire(key, DEFAULT_TTL)
            .exec();

        return true;
    } catch (error) {
        console.error(`[Redis] Error bulk pushing for ${sessionId}:`, error.message);
        return false;
    }
};

export const getHistory = async (sessionId) => {
    const key = keys.SESSION_MESSAGES(sessionId);
    try {
        const messages = await client.lRange(key, 0, -1);

        if (!messages || messages.length === 0) return null;

        return messages.map(msg => JSON.parse(msg));
    } catch (error) {
        console.error(`[Redis] Error fetching history for ${sessionId}:`, error.message);
        return null;
    }
};

/**
 * Updates session metadata (title, tier, user identity)
 */
export const setSessionMetadata = async (sessionId, data) => {
    const key = keys.SESSION_METADATA(sessionId);
    try {
        await client.multi()
            .hSet(key, data)
            .expire(key, DEFAULT_TTL)
            .exec();

        return true;
    } catch (error) {
        console.error(`[Redis] Error setting metadata for ${sessionId}:`, error.message);
        return false;
    }
};

/**
 * Retrieves the session metadata snapshot
 */
export const getSessionMetadata = async (sessionId) => {
    const key = keys.SESSION_METADATA(sessionId);
    try {
        const data = await client.hGetAll(key);
        return (Object.keys(data).length === 0) ? null : data;
    } catch (error) {
        console.error(`[Redis] Error getting metadata for ${sessionId}:`, error.message);
        return null;
    }
};

export const setUserProfile = async (userId, profileData) => {
    const key = keys.USER_PROFILE(userId);
    try {
        await client.multi()
            .hSet(key, profileData)
            .expire(key, DEFAULT_TTL)
            .exec();
        return true;
    } catch (error) {
        console.error(`[Redis] Error setting profile for ${userId}:`, error.message);
        return false;
    }
};

export const getUserProfile = async (userId) => {
    const key = keys.USER_PROFILE(userId);
    try {
        const data = await client.hGetAll(key);
        return (Object.keys(data).length === 0) ? null : data;
    } catch (error) {
        console.error(`[Redis] Error getting profile for ${userId}:`, error.message);
        return null;
    }
};

export const setUserSessionList = async (userId, sessions) => {
    const key = `${keys.USER_PROFILE(userId)}:sessions`; // Dedicated key for session array
    try {
        const sessionStrings = sessions.map(s => JSON.stringify(s));

        await client.multi()
            .del(key) // Clear old list
            .rPush(key, sessionStrings)
            .expire(key, DEFAULT_TTL)
            .exec();
        return true;
    } catch (error) {
        console.error(`[Redis] Error setting session list for ${userId}:`, error.message);
        return false;
    }
};

export const getUserSessionList = async (userId) => {
    const key = `${keys.USER_PROFILE(userId)}:sessions`;
    try {
        const sessions = await client.lRange(key, 0, -1);
        if (!sessions || sessions.length === 0) return null;
        return sessions.map(s => JSON.parse(s));
    } catch (error) {
        console.error(`[Redis] Error getting session list for ${userId}:`, error.message);
        return null;
    }
};

/**
 * Purges a session entirely from RAM
 */
export const deleteSessionCache = async (sessionId, userId = null) => {
    try {
        const keysToDelete = [
            keys.SESSION_MESSAGES(sessionId),
            keys.SESSION_METADATA(sessionId)
        ];

        // If userId is provided, we should also invalidate the user's session list
        if (userId) {
            keysToDelete.push(`${keys.USER_PROFILE(userId)}:sessions`);
        }

        await client.del(keysToDelete);
        return true;
    } catch (error) {
        console.error(`[Redis] Error deleting cache for ${sessionId}:`, error.message);
        return false;
    }
};
