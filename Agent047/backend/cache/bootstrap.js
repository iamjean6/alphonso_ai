import User from "../model/user.js";
import { initUsernameBloom, addUsernameToBloom } from "./query.js";

/**
 * CACHE BOOTSTRAPPER
 * This ensures our Bloom Filter and other "Warm" caches are 
 * ready before the server starts accepting requests.
 */
export const bootstrapCache = async () => {
    try {
        console.log("[Elite Cache] Starting Bootstrap Process...");

        // 1. Initialize the Bloom Filter schema
        await initUsernameBloom();

        // 2. Fetch all existing usernames from MongoDB
        // We use .lean() and select only 'username' for maximum speed
        const users = await User.find({}, 'username').lean();
        
        if (users.length > 0) {
            console.log(`[Elite Cache] Found ${users.length} users in DB. Syncing to Bloom Filter...`);
            
            // 3. Add each username to the filter
            // We use a Promise.all for concurrency, though Bloom Add is extremely fast
            await Promise.all(users.map(user => {
                if (user.username) {
                    return addUsernameToBloom(user.username);
                }
                return Promise.resolve();
            }));
            
            console.log("[Elite Cache] Bloom Filter Bootstrapped Successfully.");
        } else {
            console.log("[Elite Cache] No users found in DB to bootstrap.");
        }

    } catch (error) {
        console.error("[Elite Cache] Critical Bootstrap Failure:", error.message);
    }
};
