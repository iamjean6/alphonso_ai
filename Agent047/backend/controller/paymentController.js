import User from '../model/user.js';
import Transaction from '../model/transaction.js';
import { getAccessToken, paypalClient } from '../routes/paypal.js';

/**
 * SHARED GRANT PRO STATUS FUNCTION
 * Centralizes the tier upgrade logic across all payment gateways.
 */
export const grantProStatus = async (uid, amount, provider, referenceId, planTier = 'elite') => {
    try {
        const proUntilDate = new Date();
        proUntilDate.setDate(proUntilDate.getDate() + 30);

        let tx = await Transaction.findOne({ providerOrderId: referenceId });
        
        let dbUser;
        if (tx && tx.userId) {
            dbUser = await User.findById(tx.userId);
        } else {
            dbUser = await User.findOne({ $or: [{ email: uid }, { uid: uid }] });
        }

        if (!dbUser) {
            throw new Error(`Athlete profile not found for uid: ${uid}`);
        }

        if (!tx) {
            tx = await Transaction.create({
                userId: dbUser._id,
                idempotencyKey: referenceId,
                provider,
                amount,
                currency: 'USD',
                plan: planTier,
                status: 'completed',
                providerOrderId: referenceId
            });
        } else {
            tx.status = 'completed';
            await tx.save();
        }

        dbUser.tier = planTier;
        dbUser.isPro = true;
        dbUser.proUntil = proUntilDate;
        dbUser.paymentHistory.push(`${provider.toUpperCase()}: Success | Ref: ${referenceId}`);
        await dbUser.save();

        console.log(`✅ Athlete ${dbUser.email} upgraded to ${planTier} tier via ${provider}.`);
        return true;
    } catch (error) {
        console.error("Grant Pro Status Error:", error);
        throw error;
    }
};

/**
 * PAYPAL WEBHOOK
 * Listens for PAYMENT.CAPTURE.COMPLETED securely
 */
export const paypalWebhook = async (req, res) => {
    try {
        console.log("--- RECEIVED PAYPAL WEBHOOK ---");
        
        // 1. Extract Webhook Signature Headers
        const headers = req.headers;
        const transmissionId = headers['paypal-transmission-id'];
        const transmissionTime = headers['paypal-transmission-time'];
        const certUrl = headers['paypal-cert-url'];
        const authAlgo = headers['paypal-auth-algo'];
        const transmissionSig = headers['paypal-transmission-sig'];
        
        const webhookId = process.env.PAYPAL_WEBHOOK_ID;
        
        if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig || !webhookId) {
            console.error("Missing webhook headers or PAYPAL_WEBHOOK_ID is not set in .env");
            return res.status(400).send("Invalid Webhook Signature");
        }

        const accessToken = await getAccessToken();

        // 2. Call PayPal to Verify Signature
        const verifyResponse = await paypalClient.post('v1/notifications/verify-webhook-signature', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            json: {
                auth_algo: authAlgo,
                cert_url: certUrl,
                transmission_id: transmissionId,
                transmission_sig: transmissionSig,
                transmission_time: transmissionTime,
                webhook_id: webhookId,
                webhook_event: req.body
            }
        });

        if (verifyResponse.body.verification_status !== 'SUCCESS') {
            console.error("PayPal Webhook Signature Verification FAILED.");
            return res.status(400).send("Signature Verification Failed");
        }

        console.log("✅ PayPal Webhook Signature Verified Successfully.");

        const webhookEvent = req.body;

        if (webhookEvent.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
            const capture = webhookEvent.resource;
            const orderId = capture.supplementary_data?.related_ids?.order_id || capture.id;
            
            const tx = await Transaction.findOne({ providerOrderId: orderId });
            if (tx) {
                const dbUser = await User.findById(tx.userId);
                if (dbUser) {
                    await grantProStatus(dbUser.email, capture.amount.value, 'paypal', orderId, tx.plan);
                }
            } else {
                console.warn(`Webhook received for order ${orderId} but no transaction found.`);
            }
        }

        res.status(200).send("OK");
    } catch (error) {
        console.error("PayPal Webhook Error:", error.response?.body || error.message);
        res.status(500).send("Internal Server Error");
    }
};

/**
 * SIMULATED MPESA CALLBACK (Daraja API)
 */
export const mpesaCallback = async (req, res) => {
    try {
        console.log("--- RECEIVED MPESA CALLBACK ---");
        const { Body } = req.body;
        
        if (Body.stkCallback.ResultCode === 0) {
            const uid = Body.stkCallback.MpesaReceiptNumber;
            const amount = 1000;
            
            await grantProStatus(req.query.uid || "test-athlete", amount, 'mpesa', uid);
        }

        res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    } catch (error) {
        console.error("M-Pesa Callback Error:", error.message);
        res.status(500).json({ message: "Error processing payment callback." });
    }
};

/**
 * SIMULATED PAYSTACK WEBHOOK
 */
export const paystackWebhook = async (req, res) => {
    try {
        console.log("--- RECEIVED PAYSTACK WEBHOOK ---");
        const { event, data } = req.body;

        if (event === "charge.success") {
            const uid = data.customer.email;
            await grantProStatus(data.metadata?.uid || uid, data.amount / 100, 'paystack', data.reference);
        }

        res.status(200).send("OK");
    } catch (error) {
        console.error("Paystack Webhook Error:", error.message);
        res.status(500).send("Internal Server Error");
    }
};
