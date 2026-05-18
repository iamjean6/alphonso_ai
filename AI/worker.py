import os
import sys
import json
import uuid
import logging
import asyncio
from dotenv import load_dotenv

load_dotenv()

from confluent_kafka import Consumer, Producer, KafkaException
import redis.asyncio as aioredis

from google.adk import Runner
from google.genai import types
from google.adk.events.event import Event
from google.adk.agents.run_config import RunConfig, StreamingMode
from adk_agent.agent import alphonso_app, memory_service, artifact_service, session_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AlphonsoWorker")

KAFKA_BROKER = os.getenv("KAFKA_BOOTSTRAP") or os.getenv("KAFKA_BROKER") or "localhost:9092"
REDIS_URL = os.getenv("REDIS", "redis://localhost:6379")

# Initialize Redis Client
redis_client = aioredis.from_url(REDIS_URL)

# Initialize Kafka Producer for sending responses
producer_conf = {'bootstrap.servers': KAFKA_BROKER}

# Initialize Kafka Consumer for receiving tasks
consumer_conf = {
    'bootstrap.servers': KAFKA_BROKER,
    'group.id': 'ai-worker-group',
    'auto.offset.reset': 'earliest',
    'enable.auto.commit': False
}

KAFKA_SASL_USERNAME = os.getenv("KAFKA_API") or os.getenv("KAFKA_SASL_USERNAME")
KAFKA_SASL_PASSWORD = os.getenv("KAFKA_SECRET") or os.getenv("KAFKA_SASL_PASSWORD")

if KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD:
    sasl_conf = {
        'security.protocol': 'SASL_SSL',
        'sasl.mechanism': 'PLAIN',
        'sasl.username': KAFKA_SASL_USERNAME,
        'sasl.password': KAFKA_SASL_PASSWORD
    }
    producer_conf.update(sasl_conf)
    consumer_conf.update(sasl_conf)

kafka_producer = Producer(producer_conf)
kafka_consumer = Consumer(consumer_conf)
kafka_consumer.subscribe(['ai-chat-requests'])

runner = Runner(
    app=alphonso_app,
    session_service=session_service,
    memory_service=memory_service,
    artifact_service=artifact_service
)

async def process_task(msg):
    try:
        val = json.loads(msg.value().decode('utf-8'))
        session_id = val.get("sessionId")
        user_id = val.get("userId")
        tier = val.get("tier", "ELITE")
        active_sport = val.get("activeSport", "basketball")
        athlete_bio = val.get("athleteBio")
        message_text = val.get("message")

        logger.info(f"[Kafka Worker] Starting processing for Session: {session_id} | User: {user_id}")

        session_channel = f"stream:{session_id}"

        active_session = await session_service.get_session(
            app_name=alphonso_app.name, user_id=user_id, session_id=session_id
        )
        if not active_session:
            active_session = await session_service.create_session(
                app_name=alphonso_app.name, user_id=user_id, session_id=session_id
            )

        active_session.state["athlete_tier"] = tier.upper()
        if active_sport:
            active_session.state["active_sport"] = active_sport
        if athlete_bio:
            active_session.state["athlete_bio"] = athlete_bio
        active_session.state["turn_context_loaded"] = False

        auth_stamped_message = f"[SYSTEM_AUTH: TIER={tier.upper()}]\n{message_text}"
        run_config = RunConfig(streaming_mode=StreamingMode.SSE)

        final_text = ""
        active_agent = None
        agent_status_map = {
            "agent0": " Extracting performance stats from your data...",
            "analytics_agent": "Crunching analytics and plotting trends...",
            "media_scout": "Parsing video for tactical footage...",
            "agent1": "Synthesizing tactical sports research...",
            "agent2": "Building your custom video curriculum...",
            "alphonso": "Alphonso is finalizing your performance audit..."
        }

        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=types.Content(parts=[types.Part(text=auth_stamped_message)]),
            run_config=run_config
        ):
            current_author = getattr(event, 'author', None)
            if current_author != active_agent and current_author in agent_status_map:
                active_agent = current_author
                status_msg = agent_status_map[current_author]
                status_event = f"data: {json.dumps({'type': 'status', 'status': 'WORKING', 'message': status_msg})}\n\n"
                try:
                    await redis_client.publish(session_channel, status_event)
                except Exception as r_err:
                    logger.warning(f"[Redis] Broadcast warning: {r_err}")

            if hasattr(event, 'content') and event.content:
                if event.author == 'alphonso':
                    for part in event.content.parts:
                        if part.text:
                            chunk = part.text
                            if event.partial:
                                chunk_event = f"data: {json.dumps({'type': 'content', 'chunk': chunk})}\n\n"
                                try:
                                    await redis_client.publish(session_channel, chunk_event)
                                except Exception:
                                    pass
                                final_text += chunk
                            else:
                                final_text = chunk

        # Memory Persistence
        if final_text:
            try:
                active_session = await session_service.get_session(app_name=alphonso_app.name, user_id=user_id, session_id=session_id)
                user_id_override = active_session.state.get("user_id_override")
                target_user_id = user_id_override if user_id_override and user_id_override != "Unknown" else user_id
                save_events = [
                    Event(author="user", content=types.Content(role="user", parts=[types.Part(text=message_text)])),
                    Event(author="model", content=types.Content(role="model", parts=[types.Part(text=final_text)]))
                ]
                if hasattr(memory_service, "add_events_to_memory"):
                    await memory_service.add_events_to_memory(app_name=alphonso_app.name, user_id=target_user_id, events=save_events)
                logger.info(f"[Worker] Memory successfully saved for {target_user_id}!")
            except Exception as mem_err:
                logger.error(f"[Worker] Failed to save memory: {mem_err}", exc_info=True)

        # Notify Redis that streaming is done
        done_event = f"data: {json.dumps({'type': 'status', 'status': 'DONE'})}\n\n"
        try:
            await redis_client.publish(session_channel, done_event)
        except Exception:
            pass

        # Publish final success event to Kafka
        response_payload = {
            "sessionId": session_id,
            "userId": user_id,
            "status": "SUCCESS",
            "fullResponse": final_text,
            "sessionImages": [],
            "errorDetail": None
        }
        kafka_producer.produce('ai-chat-responses', key=str(session_id), value=json.dumps(response_payload))
        kafka_producer.flush()

        # Commit Kafka offset after successful processing
        kafka_consumer.commit(msg, asynchronous=False)
        logger.info(f"[Worker] Successfully completed job for session {session_id}")

    except Exception as exc:
        logger.error(f"[Worker] Unhandled error during task processing: {exc}", exc_info=True)
        # Publish error state to Kafka
        try:
            val = json.loads(msg.value().decode('utf-8'))
            session_id = val.get("sessionId")
            user_id = val.get("userId")
            err_payload = {
                "sessionId": session_id,
                "userId": user_id,
                "status": "ERROR",
                "errorDetail": str(exc)
            }
            kafka_producer.produce('ai-chat-responses', key=str(session_id), value=json.dumps(err_payload))
            kafka_producer.flush()
            
            err_event = f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
            await redis_client.publish(f"stream:{session_id}", err_event)
            kafka_consumer.commit(msg, asynchronous=False)
        except Exception as recovery_err:
            logger.error(f"[Worker] Failed to recover error state: {recovery_err}", exc_info=True)

async def main_loop():
    logger.info("🦾 Alphonso AI Kafka Worker Daemon initialized and waiting for tasks...")
    loop = asyncio.get_running_loop()
    try:
        while True:
            # Poll Kafka in a separate thread so it doesn't block the asyncio event loop
            msg = await loop.run_in_executor(None, kafka_consumer.poll, 1.0)
            if msg is None:
                continue
            if msg.error():
                logger.error(f"[Kafka Consumer] Error: {msg.error()}")
                continue
            
            # Spawn task processing
            await process_task(msg)
            
    except asyncio.CancelledError:
        logger.info("Shutting down worker daemon...")
    finally:
        kafka_consumer.close()
        kafka_producer.flush()

if __name__ == "__main__":
    try:
        asyncio.run(main_loop())
    except KeyboardInterrupt:
        logger.info("Worker stopped by user.")
