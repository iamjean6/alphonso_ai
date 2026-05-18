import axios from "axios";

// Node.js Gateway URL
const BASE_URL = 'http://localhost:3000';

/**
 * In-memory token storage (Security best practice)
 */
let _accessToken = null;

export const setAccessToken = (token) => {
    _accessToken = token;
};

export const getAccessToken = () => _accessToken;

/**
 * Axios Instance with Credentials
 * BTS: withCredentials is REQUIRED to send the 'refreshToken' cookie.
 */
const api = axios.create({
    baseURL: BASE_URL,
    withCredentials: true 
});

/**
 * Request Interceptor: Attach the memory-stored Access Token
 */
api.interceptors.request.use((config) => {
    if (_accessToken) {
        config.headers.Authorization = `Bearer ${_accessToken}`;
    }
    return config;
}, (error) => Promise.reject(error));

/**
 * Response Interceptor: Handle 401 and Refresh Token
 */
let isRefreshing = false;
let refreshSubscribers = [];

const subscribeTokenRefresh = (cb) => {
    refreshSubscribers.push(cb);
};

const onTokenRefreshed = (token) => {
    refreshSubscribers.map((cb) => cb(token));
    refreshSubscribers = [];
};

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response && error.response.status === 401 && !originalRequest._retry) {
            
            // If the error code is specifically TOKEN_EXPIRED, we attempt refresh
            // Otherwise, it's a hard 401 (invalid credentials, etc.)
            if (error.response.data.code === 'TOKEN_EXPIRED' || !originalRequest.headers.Authorization) {
                
                if (isRefreshing) {
                    return new Promise((resolve) => {
                        subscribeTokenRefresh((token) => {
                            originalRequest.headers.Authorization = `Bearer ${token}`;
                            resolve(api(originalRequest));
                        });
                    });
                }

                originalRequest._retry = true;
                isRefreshing = true;

                try {
                    const { token } = await refreshAccessToken();
                    setAccessToken(token);
                    isRefreshing = false;
                    onTokenRefreshed(token);

                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return api(originalRequest);
                } catch (refreshError) {
                    isRefreshing = false;
                    console.error("Refresh token failed. Logging out.");
                    logout();
                    return Promise.reject(refreshError);
                }
            }
        }
        return Promise.reject(error);
    }
);

/**
 * 1. AUTHENTICATION
 */
export const register = async (userData) => {
    // userData contains { email, password, username, otp }
    const response = await api.post(`/api/auth/signup`, userData);
    if (response.data.token) {
        setAccessToken(response.data.token);
        localStorage.setItem("user", JSON.stringify(response.data.user));
    }
    return response.data;
};

export const login = async (credentials) => {
    // credentials contains { email, password } 
    // note: 'email' field can be username OR email due to backend resilience update
    const response = await api.post(`/api/auth/login`, credentials);
    if (response.data.token) {
        setAccessToken(response.data.token);
        localStorage.setItem("user", JSON.stringify(response.data.user));
    }
    return response.data;
};

export const refreshAccessToken = async () => {
    const response = await api.post(`/api/auth/refresh`);
    return response.data; // { token: '...' }
};

export const logout = async () => {
    try {
        await api.post(`/api/auth/logout`);
    } catch (e) {
        console.warn("Logout request failed on server side.");
    } finally {
        setAccessToken(null);
        localStorage.removeItem("user");
        // Clear tokens from memory and local storage
    }
};

export const checkUsername = async (username) => {
    const response = await api.get(`/api/auth/check-username?username=${username}`);
    return response.data; // { available: true/false }
};

export const requestOTP = async (email) => {
    const response = await api.post(`/api/auth/request-otp`, { email });
    return response.data;
};

/**
 * 2. PROFILE MANAGEMENT
 */
export const getUserDetails = async () => {
    const response = await api.get(`/api/auth/user`);
    return response.data; 
};

export const updateProfile = async (profileData) => {
    const response = await api.post(`/update-profile`, profileData);
    return response.data;
};

/**
 * 3. CHAT SESSIONS
 */
export const getSessions = async () => {
    const response = await api.get(`/sessions`);
    return response.data;
};

export const deleteSession = async (sessionId) => {
    const response = await api.delete(`/sessions/${sessionId}`);
    return response.data;
};

export const getSessionMessages = async (sessionId) => {
    const response = await api.get(`/sessions/${sessionId}/messages`);
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
            'Authorization': `Bearer ${_accessToken}`
        },
        body: JSON.stringify({ message, session_id: sessionId })
    });

    if (!response.ok) {
        if (response.status === 401) {
            // Attempt a one-time manual refresh for streaming requests if they fail
            try {
                const { token } = await refreshAccessToken();
                setAccessToken(token);
                // Retry once
                return chatWithAi(message, sessionId, onChunk);
            } catch (err) {
                console.error("Stream failed after refresh attempt.");
                throw new Error("Session expired. Please refresh the page.");
            }
        }
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
                    const jsonStr = line.slice(6).trim();
                    if (jsonStr === '[DONE]') {
                        return; 
                    }
                    
                    const data = JSON.parse(jsonStr);
                    onChunk(data); 
                    
                    if (data.status === 'DONE' || data.status === 'finished' || data.type === 'error') {
                        return;
                    }
                } catch (e) {
                    // Ignore malformed JSON
                }
            } else if (line.startsWith(': ping')) {
                // SSE Heartbeat comment received, keep socket alive
                console.debug("[SSE] Heartbeat received");
            }
        }
    }
};

/**
 * 5. PERFORMANCE STATS UPLOAD
 */
export const uploadStatsFile = async (file, sessionId, onProgress) => {
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        throw new Error("🚨 ATHLETE ALERT: Video exceeds 50MB limit.");
    }

    try {
        const handshakeResponse = await api.post(`/get-upload-url`, {
            filename: file.name,
            content_type: file.type || "application/octet-stream",
            session_id: sessionId
        });

        const { upload_url } = handshakeResponse.data;

        // Note: Direct GCS upload does NOT need our Auth header as it uses a Signed URL.
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

        return { status: "success", filename: file.name };

    } catch (err) {
        console.error("Direct Upload Error:", err);
        throw new Error(err.response?.data?.message || err.message || "Failed to stream video.");
    }
};
/**
 * 6. PAYMENTS & PAYPAL
 */
export const createPayPalOrder = async (orderData) => {
    // orderData: { plan, amount, currency, idempotencyKey }
    const response = await api.post(`/api/paypal/create-order`, orderData);
    return response.data;
};

export const capturePayPalPayment = async (orderId) => {
    const response = await api.post(`/api/paypal/capture-payment/${orderId}`);
    return response.data;
};
