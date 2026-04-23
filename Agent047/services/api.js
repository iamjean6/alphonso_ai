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
                    const data = JSON.parse(line.slice(6));
                    onChunk(data); // Call the callback with the parsed chunk
                } catch (e) {
                    // Ignore malformed JSON or empty lines
                }
            }
        }
    }
};

/**
 * 5. PERFORMANCE STATS UPLOAD
 * Allows athletes to upload CSV/JSON files for AI analysis
 */
export const uploadStatsFile = async (file, sessionId) => {
    const formData = new FormData();
    formData.append("file_upload", file);
    formData.append("session_id", sessionId);

    const response = await axios.post(`${BASE_URL}/upload`, formData, {
        headers: {
            ...getAuthHeaders(),
            "Content-Type": "multipart/form-data"
        }
    });
    return response.data;
};
