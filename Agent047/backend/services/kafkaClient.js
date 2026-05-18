import { Kafka } from 'kafkajs';
import dotenv from 'dotenv';
import Message from '../model/message.js';
import { pushMessage } from '../cache/query.js';
import { parseAlphonsoResponse } from '../utils/parser.js';

dotenv.config();

const bootstrapServer = process.env.KAFKA_BOOTSTRAP || process.env.KAFKA_BROKER || 'localhost:9092';
const brokers = [bootstrapServer];

const saslUsername = process.env.KAFKA_API || process.env.KAFKA_SASL_USERNAME;
const saslPassword = process.env.KAFKA_SECRET || process.env.KAFKA_SASL_PASSWORD;

const kafkaConfig = {
    clientId: 'alphonso-node-gateway',
    brokers: brokers,
    retry: {
        initialRetryTime: 300,
        retries: 10
    }
};

if (saslUsername && saslPassword) {
    kafkaConfig.ssl = true;
    kafkaConfig.sasl = {
        mechanism: 'plain',
        username: saslUsername,
        password: saslPassword
    };
}

export const kafka = new Kafka(kafkaConfig);

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'alphonso-gateway-group' });

// In-memory map of active SSE response streams: key = sessionId, value = res object
export const activeStreamSessions = new Map();

let producerConnected = false;
let consumerConnected = false;

export const connectKafka = async () => {
    try {
        if (!producerConnected) {
            await producer.connect();
            producerConnected = true;
            console.log(`[Kafka] Producer connected successfully to ${brokers}`);
        }
        if (!consumerConnected) {
            await consumer.connect();
            await consumer.subscribe({ topic: 'ai-chat-responses', fromBeginning: false });
            consumerConnected = true;
            console.log(`[Kafka] Consumer subscribed to 'ai-chat-responses'`);
            
            // Start listening for completion/error signals from Python
            await consumer.run({
                eachMessage: async ({ message }) => {
                    try {
                        const payload = JSON.parse(message.value.toString());
                        const { sessionId, userId, status, fullResponse, sessionImages, errorDetail } = payload;
                        
                        console.log(`[Kafka Consumer] Received status ${status} for session ${sessionId}`);

                        if (status === "SUCCESS") {
                            // Persist to Hot Cache & DB
                            const { cleanedText, videos } = parseAlphonsoResponse(fullResponse || "");
                            const assistantMsg = {
                                sessionId,
                                uid: userId,
                                role: 'assistant',
                                content: cleanedText || (sessionImages?.length > 0 ? "Visual Data Deconstruction" : (videos?.length > 0 ? "Video Scouting Report" : "")),
                                rawContent: fullResponse,
                                videos,
                                images: sessionImages || []
                            };

                            pushMessage(sessionId, assistantMsg);
                            Message.create(assistantMsg).catch(err => console.error("[DB] Failed to save AI response:", err));
                        } else if (status === "ERROR") {
                            // Save error record
                            const assistantErrMsg = {
                                sessionId,
                                uid: userId,
                                role: 'assistant',
                                content: `[SYSTEM ERROR] ${errorDetail || 'Agent processing failure.'}`,
                                isError: true
                            };
                            pushMessage(sessionId, assistantErrMsg);
                            Message.create(assistantErrMsg).catch(err => console.error("[DB] Failed to save error record:", err));
                        }

                        // Notify active SSE Stream
                        const sessionObj = activeStreamSessions.get(sessionId);
                        if (sessionObj) {
                            const { res, heartbeatInterval } = sessionObj;
                            if (heartbeatInterval) clearInterval(heartbeatInterval);

                            if (status === "SUCCESS") {
                                res.write(`data: ${JSON.stringify({ type: 'status', status: 'DONE' })}\n\n`);
                                res.end();
                            } else if (status === "ERROR") {
                                res.write(`data: ${JSON.stringify({ type: 'error', message: errorDetail || 'Agent processing failure' })}\n\n`);
                                res.end();
                            }
                            activeStreamSessions.delete(sessionId);
                        }
                    } catch (parseErr) {
                        console.error("[Kafka Consumer] Error processing response message:", parseErr);
                    }
                }
            });
        }
    } catch (error) {
        console.error(`[Kafka] Connection failed:`, error.message);
        setTimeout(connectKafka, 5000);
    }
};

export const produceMessage = async (topic, key, payload) => {
    if (!producerConnected) {
        await connectKafka();
    }
    try {
        await producer.send({
            topic,
            messages: [
                { key: String(key), value: JSON.stringify(payload) }
            ]
        });
        console.log(`[Kafka Producer] Produced task to ${topic} for session ${key}`);
        return true;
    } catch (error) {
        console.error(`[Kafka Producer] Failed to produce to ${topic}:`, error.message);
        throw error;
    }
};

export const disconnectKafka = async () => {
    if (producerConnected) await producer.disconnect();
    if (consumerConnected) await consumer.disconnect();
};

process.on("SIGINT", async () => {
    await disconnectKafka();
});
