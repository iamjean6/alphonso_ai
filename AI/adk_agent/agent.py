from dotenv import load_dotenv
import os

# Robust .env loading - MUST happen before any local imports that depend on config
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv()

from google.adk.apps import App
from google.adk.agents.sequential_agent import SequentialAgent
from .subagents import agent0, agent1, agent2, agent3
from google.adk.plugins.reflect_retry_tool_plugin import ReflectAndRetryToolPlugin
from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmRequest, LlmResponse
from google.adk.artifacts import GcsArtifactService
from google.genai import types
from typing import Optional
from google.adk.memory import VertexAiMemoryBankService
from google.adk.events.event import Event
import vertexai

import re
import logging
import sys

# Logging setup
logger = logging.getLogger(__name__)
handler = logging.StreamHandler(sys.stdout)
handler = logging.StreamHandler(sys.stdout)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)
logger.setLevel(logging.INFO)



# Initialize Memory Service
PROJECT_ID = os.getenv('GOOGLE_CLOUD_PROJECT')
LOCATION = os.getenv('GOOGLE_CLOUD_LOCATION')
AGENT_ID_RAW = os.getenv('AGENT_ENGINE_ID')
# Strip prefix if full resource name was provided
AGENT_ID = AGENT_ID_RAW.split('/')[-1] if AGENT_ID_RAW else None
STAGING_BUCKET = os.environ.get("GOOGLE_CLOUD_STAGING_BUCKET", "gs://agent047")

logging.info(f"Initializing Memory Service with Project: {PROJECT_ID}, Location: {LOCATION}, Agent ID: {AGENT_ID}")
vertexai.init(
    project=PROJECT_ID,
    location=LOCATION,
    staging_bucket=STAGING_BUCKET,
)
memory_service = VertexAiMemoryBankService(
    project=PROJECT_ID,
    location=LOCATION,
    agent_engine_id=AGENT_ID
)

MEMORY_SCOPE_APP = "alphonso_performance_mentor"
    
artifact_service = None
if os.getenv('BUCKET_NAME'):
    try:
        artifact_service = GcsArtifactService(bucket_name=os.getenv('BUCKET_NAME'))
        logger.info(f"GCS Artifact Service initialized with bucket: {os.getenv('BUCKET_NAME')}")
    except Exception as e:
        logger.error(f"Failed to initialize GCS Artifact Service: {e}")
else:
    logger.warning("BUCKET_NAME not found in environment. Artifacts will default to In-Memory storage.")


def is_greeting(text: str) -> bool:
    """Detects simple greetings to avoid unnecessary research calls."""
    if not text:
        return False
    # Trim and normalize
    clean_text = text.strip().lower().rstrip(".!?")
    greetings = {"hello", "hi", "greetings", "hey", "yo", "sup"}
    
    # If the text is exactly one of the greeting words
    if clean_text in greetings:
        return True
        
    # If it's a very short conversational opener (e.g., "hi there", "hello alphonso")
    words = clean_text.split()
    if len(words) <= 3 and any(g in words for g in greetings):
        return True
        
    return False

async def before_model_callback(callback_context: CallbackContext, llm_request: LlmRequest) -> Optional[LlmResponse]:
    """
    Refined callback to inject context and handle greeting skips.
    """
    # 1. Redundant safety: Check if this turns out to be a greeting even if the global flag missed it
    user_input = callback_context.user_content.parts[0].text if callback_context.user_content else ""
    if callback_context.state.get("is_greeting_only") or is_greeting(user_input):
        # Return a dummy response to bypass the LLM for researchers
        return LlmResponse(
            content=types.Content(parts=[types.Part(text="[System: Research skipped as this is a greeting.]")]),
            custom_metadata={"author": callback_context.agent_name}
        )
        logger.info("SUBAGENTS 1 & 2 execution skipped ")

    # 2. Agent 0 Specific: Skip if no artifacts found
    if callback_context.agent_name == "agent0" and artifact_service:
        filenames = await artifact_service.list_artifact_keys(
            app_name=callback_context.session.app_name,
            user_id=callback_context.session.user_id,
            session_id=callback_context.session.id
        )
        if not filenames:
            logger.info("No artifacts found in GCS for Agent 0. Skipping to Researcher.")
            return LlmResponse(
                content=types.Content(parts=[types.Part(text="USER_STATS: NONE")]),
                custom_metadata={"author": "agent0_bypass"}
            )

    # 3. Extract context from the shared session state
    user_name = callback_context.state.get("user_name")
    active_sport = callback_context.state.get("active_sport", "General Sports")
    athlete_bio = callback_context.state.get("athlete_bio")
    
    # 4. Bind the name to the state; we avoid changing session.user_id mid-flight to prevent session service lookups from failing.
    if user_name and user_name != "Unknown":
        callback_context.state["user_id_override"] = user_name
    
    # 4. Build the context injection string
    identity_context = f"User Name: {user_name}. " if user_name else "User Identity: Anonymous Athlete. "
    if athlete_bio:
        identity_context += f"| {athlete_bio} "
        
    sport_context = f"Active Sport Context: {active_sport}."
    
    # 5. Inject into the system instruction
    memories = callback_context.state.get("past_memories")
    memory_injection = f"\n[PAST ATHLETE MEMORIES]\n{memories}\n" if memories else ""
    
    injection = f"\n\n[CONTEXT INJECTION]\n{identity_context}\n{sport_context}\n{memory_injection}[END CONTEXT]"
    llm_request.append_instructions([injection])
    
    return None

async def before_agent_callback(callback_context: CallbackContext) -> Optional[types.Content]:
    """Global callback to detect greetings and fetch past athlete memories with Name Bias."""
    user_input = callback_context.user_content.parts[0].text if callback_context.user_content else ""
    
    if "user_name" not in callback_context.state:
        callback_context.state["user_name"] = "Unknown"
    if "active_sport" not in callback_context.state:
        callback_context.state["active_sport"] = "Unknown"
    if "is_greeting_only" not in callback_context.state:
        callback_context.state["is_greeting_only"] = False
    
    # Capture the current user query for the manual save at the end
    callback_context.state["current_user_query"] = user_input
    
    # Safety initializations for sub-agent data passing
    if "user_stats" not in callback_context.state:
        callback_context.state["user_stats"] = "NONE"
    if "google_research" not in callback_context.state:
        callback_context.state["google_research"] = "No technical research found."
    if "youtube_research" not in callback_context.state:
        callback_context.state["youtube_research"] = "No visual demonstrations available."
    if "past_memories" not in callback_context.state:
        callback_context.state["past_memories"] = "No past athlete data found."

    # 2. Memory Retrieval (Strict ID enforcement)
    if user_input and not callback_context.state.get("is_greeting_only"):
        search_query = user_input
        target_user_id = callback_context.session.user_id
        
        try:
            logger.info(f"Global: Searching athlete memory bank for: '{search_query}' (App: {MEMORY_SCOPE_APP}, User: {target_user_id})")
            
            res = await memory_service.search_memory(
                app_name=MEMORY_SCOPE_APP,
                user_id=target_user_id,
                query=search_query
            )
            if res.memories:
                logger.info(f"Global: [!] Found {len(res.memories)} relevant past athlete facts for {target_user_id}.")
                # Store them in state so all sub-agents (Researchers + Alphonso) can use them
                memories_text = "\n".join([f"- {m.content.parts[0].text}" for m in res.memories])
                callback_context.state["past_memories"] = memories_text
            else:
                logger.info(f"Global: No past memories found for user {target_user_id}.")
        except Exception as e:
            logger.error(f"Global: Memory retrieval failed: {e}")
        except Exception as e:
            logger.error(f"Global: Memory retrieval failed: {e}")
        
    return None

async def auto_save_to_memory_callback(callback_context: CallbackContext):
    return None

async def agent3_confirmation_callback(callback_context: CallbackContext, llm_request: LlmRequest) -> Optional[LlmResponse]:
    """Specific callback for Agent 3 to reinforce identity and memory context."""
    return None # Context is already handled by global before_model_callback

async def agent0_artifact_callback(callback_context: CallbackContext, llm_request: LlmRequest) -> Optional[LlmResponse]:
    """Specialized callback for Agent 0 to load and inject all session artifacts from GCS."""
    if not artifact_service:
        logger.warning("Artifact service not initialized; skipping GCS ingestion.")
        return None

    try:
        # Use the global service to list files in the current session's GCS folder
        filenames = await artifact_service.list_artifact_keys(
            app_name=callback_context.session.app_name,
            user_id=callback_context.session.user_id,
            session_id=callback_context.session.id
        )
        
        # Filenames confirmed to exist by earlier before_model_callback
        for filename in filenames:
            logger.info(f"Ingesting GCS artifact '{filename}' for Agent 0.")
            part = await artifact_service.load_artifact(
                app_name=callback_context.session.app_name,
                user_id=callback_context.session.user_id,
                session_id=callback_context.session.id,
                filename=filename
            )
            if part:
                llm_request.contents.append(types.Content(role="user", parts=[part]))
        
        llm_request.append_instructions(["[SYSTEM] Analyze the attached GCS files above and extract all numerical performance stats."])
        
    except Exception as e:
        logger.error(f"Error during GCS ingestion in Agent 0 callback: {e}")
        
    return None

# Removed auto_save_to_memory_callback as the save operation is now 
# handled reliably by the FastAPI server using the run-flow pattern.

# Inject callbacks
agent0.before_model_callback = [before_model_callback, agent0_artifact_callback]
agent1.before_model_callback = before_model_callback
agent2.before_model_callback = before_model_callback
agent3.before_model_callback = agent3_confirmation_callback # Special confirmation for Zlatan



root_agent = SequentialAgent(
    name='alphonso',
    description='Alphonso: Your tough but compassionate performance mentor. He builds your legacy.',
    sub_agents=[agent0, agent1, agent2, agent3],
    before_agent_callback=before_agent_callback,
    after_agent_callback=auto_save_to_memory_callback
)
# Create the App container
alphonso_app = App(
    name='alphonso_performance_mentor',
    root_agent=root_agent,
    plugins=[ReflectAndRetryToolPlugin(max_retries=3)]
)