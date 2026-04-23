import jwt from 'jsonwebtoken';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SECRET = process.env.JWT_SECRET || 'your_dev_secret_key_change_me_in_production';
const token = jwt.sign({ uid: 'test-athlete-001' }, SECRET);

const api = axios.create({
    baseURL: 'http://localhost:3000',
    headers: { Authorization: `Bearer ${token}` }
});

async function runTest() {
    try {
        console.log("--- [STEP 1] Updating Profile ---");
        const profileRes = await api.post('/update-profile', {
            weight: 85,
            height: 195,
            primarySports: ["Basketball"],
            goals: "Improve sprint speed and vertical leap"
        });
        console.log("SUCCESS: Profile updated for athlete test-athlete-001");
        console.log("Data:", JSON.stringify(profileRes.data.profile, null, 2));

        console.log("\n--- [STEP 2] Chatting with Alphonso ---");
        console.log("Question: 'Do you know my stats and basketball goals?'");
        
        const chatRes = await api.post('/chat', {
            message: "Do you know my stats and basketball goals?",
            session_id: "test-session-999"
        }, { responseType: 'stream' });

        process.stdout.write("Alphonso's Response: ");
        
        chatRes.data.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'content') {
                            process.stdout.write(data.chunk);
                        }
                    } catch (e) {
                        // Not valid JSON or metadata, ignore
                    }
                }
            }
        });

        chatRes.data.on('end', async () => {
            console.log("\n\n--- [STEP 3] Verifying Session History ---");
            const sessionsRes = await api.get('/sessions');
            console.log(`Found ${sessionsRes.data.length} sessions in history.`);
            
            const mySession = sessionsRes.data.find(s => s.sessionId === 'test-session-999');
            if (mySession) {
                console.log("SUCCESS: Current session was correctly recorded in MongoDB.");
                console.log("Session Preview:", mySession.lastMessage);

                console.log("\n--- [STEP 4] Deleting Session ---");
                await api.delete('/sessions/test-session-999');
                console.log("SUCCESS: Session deleted.");
            } else {
                console.error("FAILURE: Session was not found in history.");
            }

            console.log("\n--- [TEST COMPLETE] ---");
        });

    } catch (error) {
        console.error("\n[!] Test Failed.");
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Details:", error.response.data);
        } else {
            console.error("Error:", error.message);
        }
    }
}

runTest();
