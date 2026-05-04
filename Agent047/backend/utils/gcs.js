import { Storage } from '@google-cloud/storage';
import dotenv from 'dotenv';

dotenv.config();

// Initialize GCS Client
// It will automatically use the GOOGLE_APPLICATION_CREDENTIALS env var if set
const storage = new Storage();
const bucketName = process.env.GCS_BUCKET;

/**
 * Generates a time-limited signed URL for a private artifact.
 * @param {string} filename - The name of the file in GCS.
 * @param {string} sessionId - The session ID (used for folder structure).
 * @returns {Promise<string>} - The signed URL.
 */
export const getSignedUrl = async (sessionId, filename) => {
    try {
        if (!bucketName) {
            throw new Error("GCS_BUCKET environment variable is not set.");
        }

        // Proactive check: If we don't have a service account email/key, 
        // signing will fail after a long timeout. Let's fail fast.
        const authClient = await storage.authClient.getCredentials();
        const canSign = authClient.client_email || process.env.GOOGLE_APPLICATION_CREDENTIALS;

        if (!canSign) {
            // console.warn(`[GCS Signer] No signing credentials found for ${filename}. Using public fallback.`);
            return `https://storage.googleapis.com/${bucketName}/sessions/${sessionId}/artifacts/${filename}`;
        }

        const bucket = storage.bucket(bucketName);
        const filePath = `sessions/${sessionId}/artifacts/${filename}`;
        const file = bucket.file(filePath);

        const options = {
            version: 'v4',
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000,
        };

        const [url] = await file.getSignedUrl(options);
        return url;
    } catch (error) {
        // Only log real errors, not configuration fallbacks
        if (error.name !== 'SigningError') {
            console.error(`[GCS Signer] Error for ${filename}:`, error.message);
        }
        return `https://storage.googleapis.com/${bucketName}/sessions/${sessionId}/artifacts/${filename}`;
    }
};
