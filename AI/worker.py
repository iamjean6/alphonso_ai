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
from google.adk.events.event_actions import EventActions
from google.adk.agents.run_config import RunConfig, StreamingMode
from adk_agent.agent import alphonso_app, memory_service, artifact_service, session_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AlphonsoWorker")

KAFKA_BROKER = os.getenv("KAFKA_BOOTSTRAP") or os.getenv("KAFKA_BROKER") or "localhost:9092"
REDIS_URL = os.getenv("REDIS", "redis://localhost:6379")

# Initialize Redis Client
redis_client = aioredis.from_url(REDIS_URL)

# Global Task Registry for Interruption
active_tasks = {}
aborted_sessions = set()

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
        'sasl.mechanisms': 'PLAIN',
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
    from adk_agent.subagents.tools.calendar_utils import active_user_context
    token_context = None
    try:
        val = json.loads(msg.value().decode('utf-8'))
        session_id = val.get("sessionId")
        user_id = val.get("userId")
        tier = val.get("tier", "ELITE")
        active_sport = val.get("activeSport", "basketball")
        primary_sports = val.get("primarySports", [])
        athlete_bio = val.get("athleteBio")
        message_text = val.get("message")
        
        # Dynamic Token Bridge & Flow Tracking
        google_calendar_token = val.get("googleCalendarToken")
        user_timezone = val.get("userTimezone", "Africa/Nairobi")
        active_flow = val.get("activeFlow", "research")

        logger.info(f"[Kafka Worker] Starting processing for Session: {session_id} | User: {user_id} | Timezone: {user_timezone} | Active Flow: {active_flow}")

        # Seed the thread-safe context variables
        ctx_data = {
            "user_id": user_id,
            "session_id": session_id,
            "user_timezone": user_timezone,
        }
        if google_calendar_token:
            ctx_data.update({
                "refresh_token": google_calendar_token.get("refresh_token"),
                "access_token": google_calendar_token.get("access_token"),
                "expiry": google_calendar_token.get("expiry"),
                "client_id": google_calendar_token.get("client_id"),
                "client_secret": google_calendar_token.get("client_secret"),
            })
        
        token_context = active_user_context.set(ctx_data)

        session_channel = f"stream:{session_id}"

        try:
            active_session = await session_service.get_session(
                app_name=alphonso_app.name, user_id=user_id, session_id=session_id
            )
            if not active_session:
                active_session = await session_service.create_session(
                    app_name=alphonso_app.name, user_id=user_id, session_id=session_id
                )

            # In ADK, state deltas must be appended as an event so runner.run_async fetches the updated state from storage
            init_delta = {
                "athlete_tier": tier.upper(),
                "active_sport": active_sport or "basketball",
                "primary_sports": primary_sports,
                "active_flow": active_flow,
                "turn_context_loaded": False
            }
            if athlete_bio:
                init_delta["athlete_bio"] = athlete_bio

            init_event = Event(
                id=f"init-{uuid.uuid4().hex[:8]}",
                invocation_id=f"init-{uuid.uuid4().hex[:8]}",
                author="system",
                actions=EventActions(state_delta=init_delta)
            )
            await session_service.append_event(active_session, init_event)

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
                "alphonso": "Alphonso is finalizing your performance audit...",
                "workout_planner_agent": "Alphonso is drafting your customized workout split..."
            }

            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=types.Content(parts=[types.Part(text=auth_stamped_message)]),
                run_config=run_config
            ):
                if session_id in aborted_sessions:
                    logger.warning(f"[Worker] Force-breaking ADK loop for aborted session {session_id}")
                    break

                current_author = getattr(event, 'author', None)
                if current_author != active_agent and current_author in agent_status_map:
                    active_agent = current_author
                    status_msg = agent_status_map[current_author]
                    status_event = f"data: {json.dumps({'type': 'status', 'status': 'WORKING', 'message': status_msg})}\n\n"
                    try:
                        await redis_client.publish(session_channel, status_event)
                    except Exception as r_err:
                        logger.warning(f"[Redis] Broadcast warning: {r_err}")

                if hasattr(event, 'content') and event.content and getattr(event.content, 'parts', None):
                    if event.author in ['alphonso', 'workout_planner_agent']:
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
            current_active_flow = active_session.state.get("active_flow", "research")
            response_payload = {
                "sessionId": session_id,
                "userId": user_id,
                "status": "SUCCESS",
                "fullResponse": final_text,
                "sessionImages": [],
                "errorDetail": None,
                "activeFlow": current_active_flow
            }
            kafka_producer.produce('ai-chat-responses', key=str(session_id), value=json.dumps(response_payload))
            kafka_producer.flush()

            # Commit Kafka offset after successful processing
            kafka_consumer.commit(msg, asynchronous=False)
            logger.info(f"[Worker] Successfully completed job for session {session_id}")
        finally:
            # Reset active user context to guarantee clean isolation between concurrent calls
            if token_context:
                active_user_context.reset(token_context)

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

async def listen_for_cancellations():
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("agent_control")
    logger.info("[Control Plane] Listening for interruption signals on 'agent_control'...")
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    if data.get("action") == "CANCEL":
                        session_id = data.get("sessionId")
                        aborted_sessions.add(session_id)
                        if session_id in active_tasks:
                            logger.warning(f"[Control Plane] 🔥 Kill signal received for session {session_id}! Aborting...")
                            task = active_tasks[session_id]
                            task.cancel()
                except Exception as e:
                    logger.error(f"[Control Plane] Failed to process control message: {e}")
    except asyncio.CancelledError:
        logger.info("[Control Plane] Shutting down listener.")
        await pubsub.unsubscribe("agent_control")

async def main_loop():
    logger.info("🦾 Alphonso AI Kafka Worker Daemon initialized and waiting for tasks...")
    
    # Start Redis listener
    asyncio.create_task(listen_for_cancellations())
    
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
            
            # Extract Session ID to register task
            try:
                val = json.loads(msg.value().decode('utf-8'))
                session_id = val.get("sessionId")
            except Exception:
                session_id = str(uuid.uuid4())
                
            # Pre-check: Was this session cancelled while waiting in Kafka?
            if session_id:
                is_cancelled = await redis_client.get(f"canceled_session_{session_id}")
                if is_cancelled:
                    logger.warning(f"[Worker] Skipping task for {session_id} - cancel signal found in cache.")
                    await redis_client.delete(f"canceled_session_{session_id}")
                    kafka_consumer.commit(msg, asynchronous=False)
                    continue

            # Spawn task processing and await it, but wrapped as a task so it can be cancelled
            task = asyncio.create_task(process_task(msg))
            active_tasks[session_id] = task
            try:
                await task
            except asyncio.CancelledError:
                logger.warning(f"[Worker] Task for session {session_id} was aborted mid-flight.")
                kafka_consumer.commit(msg, asynchronous=False)
            except BaseException as e:
                if isinstance(e, KeyboardInterrupt):
                    raise
                logger.warning(f"[Worker] Task for session {session_id} forcefully terminated ({type(e).__name__}).")
                kafka_consumer.commit(msg, asynchronous=False)
            finally:
                active_tasks.pop(session_id, None)
                aborted_sessions.discard(session_id)
            
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
