import express from "express"
import got from 'got'
import client from "../cache/index.js"
import User from "../model/user.js"
import Transaction from "../model/transaction.js"
import authMiddleware from "../middleware/auth.js"

const paypalClient = got.extend({
    prefixUrl: process.env.PAYPAL_BASEURL,
    retry: {
        limit: 3,
        methods: ["POST", "GET"],
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
        backoffLimit: 3000
    },
    responseType: 'json'
});

const router = express.Router()

const getAccessToken = async () => {
    try {
        // 1. Try to check Redis Cache first (wrapped in try/catch to be resilient)
        let cachedToken = null;
        try {
            if (client.isReady) {
                cachedToken = await client.get("paypal_access_token");
            }
        } catch (redisErr) {
            console.warn("Redis Cache Unavailable, falling back to direct PayPal fetch.");
        }

        if (cachedToken) return cachedToken;

        // 2. If not in cache or Redis is down, fetch from PayPal
        const auth = Buffer.from(`${process.env.PAYPAL_CLIENT}:${process.env.PAYPAL_SECRET}`).toString("base64");
        
        const response = await paypalClient.post(
            `v1/oauth2/token`,
            {
                headers: {
                    Authorization: `Basic ${auth}`,
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                form: {
                    grant_type: "client_credentials",
                }
            }
        )

        const { access_token, expires_in } = response.body
        
        // 3. Cache the token (resiliently)
        try {
            if (client.isReady) {
                await client.setEx("paypal_access_token", expires_in - 60, access_token)
            }
        } catch (redisErr) {
            console.warn("Failed to cache PayPal token in Redis.");
        }
        
        return access_token
    } catch (err) {
        console.error("PayPal Auth Error:", err.response?.body || err.message)
        throw new Error("Could not authenticate with PayPal")
    }
}

const createOrder = async (req, res) => {
    try {
        const { plan, amount, currency = "USD", idempotencyKey } = req.body;
        
        if (!amount) return res.status(400).json({ error: "Amount is required" });
        if (!idempotencyKey) return res.status(400).json({ error: "Idempotency key is required" });

        // 1. REDIS GUARD: Atomic Lock to prevent rapid double-clicks
        const lockKey = `idempotency_lock:${idempotencyKey}`;
        try {
            if (client.isReady) {
                const locked = await client.set(lockKey, "processing", { NX: true, EX: 60 });
                if (!locked) {
                    console.warn(`🚫 Blocked rapid duplicate request for key: ${idempotencyKey}`);
                    return res.status(429).json({ error: "Transaction already in progress. Please wait." });
                }
            }
        } catch (redisErr) {
            console.warn("Redis Guard unavailable, falling back to DB check only.");
        }

        // 2. DB REGISTRY CHECK: Long-term idempotency
        const existingTx = await Transaction.findOne({ idempotencyKey });
        if (existingTx && existingTx.providerOrderId) {
            console.log(`♻️ Returning existing order for key: ${idempotencyKey}`);
            return res.status(200).json({ id: existingTx.providerOrderId, status: "EXISTING" });
        }

        // Fetch database user to retrieve correct MongoDB ObjectId _id (required by Transaction schema)
        const dbUser = await User.findOne({
            $or: [{ uid: req.user.uid }, { email: req.user.email }]
        });
        if (!dbUser) {
            return res.status(404).json({ error: "Athlete profile not found." });
        }

        // 2. Create internal record if it doesn't exist
        const tx = existingTx || await Transaction.create({
            userId: dbUser._id,
            idempotencyKey,
            provider: 'paypal',
            amount,
            currency,
            plan,
            status: 'initiated'
        });

        const accessToken = await getAccessToken()
        const response = await paypalClient.post(
            `v2/checkout/orders`,
            {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                    "PayPal-Request-Id": idempotencyKey
                },
                json: {
                    intent: "CAPTURE",
                    purchase_units: [
                        {
                            custom_id: plan.toLowerCase(),
                            description: `${plan} Plan Subscription`,
                            amount: {
                                currency_code: currency,
                                value: parseFloat(amount).toFixed(2),
                            }
                        }
                    ],
                    application_context: {
                        brand_name: "Alphonso AI",
                        shipping_preference: "NO_SHIPPING",
                        user_action: "PAY_NOW",
                        return_url: `${process.env.PAYPAL_REDIRECT}/complete-payment`,
                        cancel_url: `${process.env.PAYPAL_REDIRECT}/cancel-payment`
                    }
                }
            },
        )

        // 3. Update record with PayPal's Order ID
        tx.providerOrderId = response.body.id;
        await tx.save();

        return res.status(200).json(response.body)
    } catch (err) {
        console.error("Create Order Error:", err.response?.body || err.message)
        res.status(500).json({ error: "Failed to create PayPal order" })
    }
}

const capturePayment = async (req, res) => {
    try {
        const { orderId } = req.params;
        const accessToken = await getAccessToken()
        
        const response = await paypalClient.post(
            `v2/checkout/orders/${orderId}/capture`,
            {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`
                }
            },
        )
        
        const orderData = response.body;
        
        if (orderData.status === "COMPLETED") {
            const planTier = orderData.purchase_units[0].payments.captures[0].custom_id || "elite";
            
            // 1. Atomically Update User and Transaction
            const userEmail = req.user.email;
            const proUntilDate = new Date();
            proUntilDate.setDate(proUntilDate.getDate() + 30);

            const [updatedUser] = await Promise.all([
                User.findOneAndUpdate(
                    { email: userEmail },
                    { 
                        tier: planTier, 
                        isPro: true,
                        proUntil: proUntilDate,
                        $push: { paymentHistory: orderId } 
                    },
                    { new: true }
                ),
                Transaction.findOneAndUpdate(
                    { providerOrderId: orderId },
                    { status: 'completed' }
                )
            ]);

            console.log(`✅ Athlete ${userEmail} upgraded to ${planTier} tier via Transaction Registry.`);

            return res.status(200).json({ 
                message: "Payment captured successfully", 
                order: orderData,
                user: {
                    tier: updatedUser.tier,
                    isPro: updatedUser.isPro
                }
            })
        }

        // Update transaction as failed if not completed
        await Transaction.findOneAndUpdate({ providerOrderId: orderId }, { status: 'failed' });
        return res.status(400).json({ message: "Payment not completed", order: orderData })

    } catch (err) {
        console.error("Capture Payment Error:", err.response?.body || err.message)
        res.status(500).json({ error: "Failed to capture PayPal payment" })
    }
}

router.post('/create-order', authMiddleware, createOrder)
router.post('/capture-payment/:orderId', authMiddleware, capturePayment)

export default router