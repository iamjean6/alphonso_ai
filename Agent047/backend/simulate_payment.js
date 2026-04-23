import axios from 'axios';

/**
 * SIMULATE PAYMENT SCRIPT
 * Run this to "Pose" as Safaricom or Paystack and unlock a user's Pro account.
 * Usage: node simulate_payment.js <UID> <TYPE>
 * Types: mpesa, paystack
 */

const uid = process.argv[2] || "test-athlete-001";
const type = process.argv[3] || "mpesa";

async function simulate() {
    console.log(`--- SIMULATING SUCCESSFUL ${type.toUpperCase()} PAYMENT FOR: ${uid} ---`);

    try {
        if (type === 'mpesa') {
            await axios.post(`http://localhost:3000/api/payments/mpesa-callback?uid=${uid}`, {
                Body: {
                    stkCallback: {
                        ResultCode: 0,
                        MpesaReceiptNumber: "SIM_MPESA_SUCCESS_" + Date.now().toString().slice(-6)
                    }
                }
            });
        } else {
            await axios.post(`http://localhost:3000/api/payments/paystack-webhook`, {
                event: "charge.success",
                data: {
                    reference: "SIM_PAYSTACK_REF_" + Date.now().toString().slice(-6),
                    metadata: { uid },
                    customer: { email: "test@athlete.com" }
                }
            });
        }
        console.log("SUCCESS: Webhook delivered. The user should now be PRO for 30 days.");
    } catch (error) {
        console.error("Simulation Failed:", error.response ? error.response.data : error.message);
    }
}

simulate();
