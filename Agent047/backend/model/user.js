import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    uid: {
        type: String,
        unique: true,
        sparse: true // Allows multiple null values for users who haven't linked an external ID yet
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    usageCount: {
        type: Number,
        default: 0
    },
    isPro: {
        type: Boolean,
        default: false
    },
    proUntil: {
        type: Date
    },
    paymentHistory: {
        type: [String],
        default: []
    },
    // Athlete Profile Fields
    height: {
        type: Number // in cm
    },
    weight: {
        type: Number // in kg
    },
    primarySports: {
        type: [String], // Array of sports (e.g., ["Basketball", "Running"])
        default: []
    },
    goals: {
        type: String
    }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
export default User;
