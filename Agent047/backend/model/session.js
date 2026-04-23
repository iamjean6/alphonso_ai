import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true
    },
    uid: {
        type: String, // UID of the athlete who owns this session
        required: true,
        index: true
    },
    title: {
        type: String,
        default: "New Performance Chat"
    },
    lastMessage: {
        type: String
    }
}, { timestamps: true });

const Session = mongoose.model('Session', sessionSchema);
export default Session;
