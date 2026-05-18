import { createClient } from "redis";
import dotenv from 'dotenv';

dotenv.config();
const redisURL = process.env.REDIS;

const redisSubscriber = createClient({ url: redisURL });

redisSubscriber.on("connect", () => console.info("[PubSub] Redis Subscriber is connecting"));
redisSubscriber.on("ready", () => console.info("[PubSub] Redis Subscriber is ready"));
redisSubscriber.on("error", e => console.error("[PubSub] Error:", e));

async function connectSubscriber() {
    try {
        await redisSubscriber.connect();
    } catch (error) {
        console.error("[PubSub] Redis Subscriber connection failed, retrying in 5 seconds...");
        setTimeout(connectSubscriber, 5000);
    }
}

connectSubscriber();

process.on("SIGINT", async () => {
    if (redisSubscriber.isOpen) {
        await redisSubscriber.disconnect();
    }
});

export default redisSubscriber;
