/**
 * ALPHONSO REDIS KEY STRATEGY
 * Centralizing keys prevents naming collisions and ensures consistency
 * across controllers and middlewares.
 */

const PREFIX = "alphonso";

const keys = {
    /**
     * CHAT SESSIONS
     */
    // List: Stores the "Hot" message history for a session
    SESSION_MESSAGES: (sessionId) => `${PREFIX}:session:${sessionId}:messages`,
    
    // Hash: Stores session metadata (title, last active, tier)
    SESSION_METADATA: (sessionId) => `${PREFIX}:session:${sessionId}:metadata`,

    /**
     * USER DATA
     */
    // Hash: Stores the athlete's physical profile and bio
    USER_PROFILE: (userId) => `${PREFIX}:user:${userId}:profile`,

    /**
     * AUTH & SECURITY
     */
    // Bloom Filter: Stores all taken usernames for O(1) availability checks
    USERNAME_BLOOM: () => `${PREFIX}:bloom:usernames`,

    // String: Stores temporary OTP for email verification (with TTL)
    USER_OTP: (email) => `${PREFIX}:otp:${email}`,

    // Set: Stores blacklisted Refresh Tokens after logout (with TTL)
    TOKEN_BLACKLIST: (tokenHash) => `${PREFIX}:blacklist:token:${tokenHash}`
};

export default keys;
