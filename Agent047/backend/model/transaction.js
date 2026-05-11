import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true 
    },
    idempotencyKey: { 
        type: String, 
        unique: true, 
        required: true 
    },
    provider: { 
        type: String, 
        enum: ['paypal', 'mpesa', 'paystack'], 
        required: true 
    },
    providerOrderId: { 
        type: String,
        index: true 
    },
    amount: { 
        type: Number, 
        required: true 
    },
    currency: { 
        type: String, 
        default: 'USD' 
    },
    plan: { 
        type: String, 
        required: true 
    },
    status: { 
        type: String, 
        enum: ['initiated', 'completed', 'failed'], 
        default: 'initiated' 
    },
    metadata: {
        type: Object, // To store provider-specific details if needed
        default: {}
    },
    createdAt: { 
        type: Date, 
        default: Date.now, 
        expires: 3600 * 24 * 7 // Keep records for 7 days
    }
}, { timestamps: true });

const Transaction = mongoose.model('Transaction', transactionSchema);

export default Transaction;
