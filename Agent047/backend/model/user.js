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
    username: {
        type: String,
        unique: true,
        trim: true,
        sparse: true // Allows uniqueness while ignoring nulls for old accounts
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
    tier: {
        type: String,
        enum: ['rookie', 'prospect', 'elite', 'legend'],
        default: 'elite'
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
    },
    refreshToken: {
        type: String
    }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
export default User;
