import axios from "axios";

// Node.js Gateway URL
const BASE_URL = 'http://localhost:3000';

/**
 * Setup Auth Headers
 */
const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};

/**
 * AXIOS INTERCEPTOR: Handle expired sessions globally
 */
axios.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            console.warn("Session expired or invalid token. Clearing storage.");
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            // Optional: window.location.href = '/login'; 
        }
        return Promise.reject(error);
    }
);

/**
 * 1. AUTHENTICATION
 */
export const register = async (email, password, username) => {
    const response = await axios.post(`${BASE_URL}/api/auth/signup`, { email, password, username });
    if (response.data.token) {
        localStorage.setItem("token", response.data.token);
        localStorage.setItem("user", JSON.stringify(response.data.user));
    }
    return response.data;
};

export const login = async (email, password) => {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, { email, password });
    if (response.data.token) {
        localStorage.setItem("token", response.data.token);
        localStorage.setItem("user", JSON.stringify(response.data.user));
    }
    return response.data;
};

export const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
};

/**
 * 2. PROFILE MANAGEMENT
 */
export const getUserDetails = async () => {
    const response = await axios.get(`${BASE_URL}/api/auth/user`, {
        headers: getAuthHeaders()
    });
    return response.data; // Expected { user: { ... } }
};

export const updateProfile = async (profileData) => {
    const response = await axios.post(`${BASE_URL}/update-profile`, profileData, {
        headers: getAuthHeaders()
    });
    return response.data;
};

/**
 * 3. CHAT SESSIONS
 */
export const getSessions = async () => {
    const response = await axios.get(`${BASE_URL}/sessions`, {
        headers: getAuthHeaders()
    });
    return response.data;
};

export const deleteSession = async (sessionId) => {
    const response = await axios.delete(`${BASE_URL}/sessions/${sessionId}`, {
        headers: getAuthHeaders()
    });
    return response.data;
};

export const getSessionMessages = async (sessionId) => {
    const response = await axios.get(`${BASE_URL}/sessions/${sessionId}/messages`, {
        headers: getAuthHeaders()
    });
    return response.data;
};

/**
 * 4. AI CHAT (Streaming)
 * Using 'fetch' instead of axios for easier SSE stream consumption in React
 */
export const chatWithAi = async (message, sessionId, onChunk) => {
    const response = await fetch(`${BASE_URL}/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
        },
        body: JSON.stringify({ message, session_id: sessionId })
    });

    if (!response.ok) {
        const err = await response.json();
        if (response.status === 401) {
            console.warn("Chat session expired. Clearing storage.");
            localStorage.removeItem("token");
            localStorage.removeItem("user");
        }
        throw new Error(err.message || "AI Service Unavailable");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const jsonStr = line.slice(6).trim();
                    if (jsonStr === '[DONE]') {
                        return; // Explicit end signal
                    }
                    
                    const data = JSON.parse(jsonStr);
                    onChunk(data); // Call the callback with the parsed chunk
                    
                    // Safety: Break if server explicitly says it's finished
                    if (data.status === 'finished') {
                        return;
                    }
                } catch (e) {
                    // Ignore malformed JSON or empty lines
                }
            }
        }
    }
};

/**
 * 5. PERFORMANCE STATS UPLOAD (High-Performance Direct Stream)
 * BTS: Bypasses Node/Python servers for the actual file transfer.
 * Handshake: Frontend -> Node -> Python -> Signed URL -> Frontend -> GCS.
 */
export const uploadStatsFile = async (file, sessionId, onProgress) => {
    // 🛡️ Elite Guard: 50MB Limit Enforcement
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_SIZE) {
        throw new Error("🚨 ATHLETE ALERT: Video exceeds 50MB limit. Please trim the tape for the best analysis experience.");
    }

    try {
        // Step 1: Request the 'Master Key' (Signed URL)
        const handshakeResponse = await axios.post(`${BASE_URL}/get-upload-url`, {
            filename: file.name,
            content_type: file.type || "application/octet-stream",
            session_id: sessionId
        }, {
            headers: getAuthHeaders()
        });

        const { upload_url } = handshakeResponse.data;

        // Step 2: Direct Push to Google Cloud Storage
        // BTS: We use a raw 'PUT' as required by GCS Signed URLs.
        // We bypass our own servers entirely for this step.
        const uploadResponse = await axios.put(upload_url, file, {
            headers: {
                "Content-Type": file.type || "application/octet-stream"
            },
            onUploadProgress: (progressEvent) => {
                if (onProgress) {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    onProgress(percentCompleted);
                }
            }
        });

        console.log(`[Visual Lab] Direct Stream Complete: ${file.name}`);
        return { status: "success", filename: file.name };

    } catch (err) {
        console.error("Direct Upload Error:", err);
        throw new Error(err.response?.data?.message || err.message || "Failed to stream video to the Lab.");
    }
};
