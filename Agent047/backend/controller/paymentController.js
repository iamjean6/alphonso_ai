import User from '../model/user.js';

/**
 * SIMULATED MPESA CALLBACK (Daraja API)
 * In production, Safaricom hits this URL after an athlete completes or cancels an STK Push.
 */
export const mpesaCallback = async (req, res) => {
    try {
        console.log("--- RECEIVED MPESA CALLBACK ---");
        const { Body } = req.body;
        
        // In M-Pesa's real structure, ResultCode 0 means Success
        if (Body.stkCallback.ResultCode === 0) {
            // We'll pass the 'uid' in the description or account reference for simulation
            // In real production, you'd match by 'CheckoutRequestID'
            const uid = Body.stkCallback.MpesaReceiptNumber; // Simulated UID for the test
            const amount = 1000; // Hardcoded simulation for now

            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 30); // Add 30 days

            await User.findOneAndUpdate(
                { uid: req.query.uid || "test-athlete-001" }, // We use query param for easier simulation
                { 
                    isPro: true, 
                    proUntil: expiryDate,
                    $push: { paymentHistory: `M-PESA: Success | Amount: ${amount} | Ref: ${uid}` }
                }
            );

            console.log(`[SUBSCRIPTION SUCCESS] Athlete ${req.query.uid} is now PRO until ${expiryDate}`);
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
            const uid = data.customer.email; // For simulation, we use email as the link
            
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 30);

            await User.findOneAndUpdate(
                { uid: data.metadata.uid || uid }, 
                { 
                    isPro: true, 
                    proUntil: expiryDate,
                    $push: { paymentHistory: `PAYSTACK: Success | Auth: ${data.reference}` }
                }
            );
        }

        res.status(200).send("OK");
    } catch (error) {
        console.error("Paystack Webhook Error:", error.message);
        res.status(500).send("Internal Server Error");
    }
};
