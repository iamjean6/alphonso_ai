import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, index: true },
    uid: { type: String, required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String }, // Optional to support visual-only responses
    rawContent: { type: String }, // Original LLM output for debugging
    videos: [{
        id: String,
        title: String,
        channel: String,
        url: String,
        views: Number,
        year: String,
        thumbnail: String,
        audit: String
    }],
    images: [{
        data: String,
        mimeType: String
    }],
    isError: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);
export default Message;
