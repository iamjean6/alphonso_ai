from dotenv import load_dotenv
import os
import time

# Robust .env loading - MUST happen before any local imports that depend on config
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv()

from google.adk.apps import App
from google.adk.agents.sequential_agent import SequentialAgent
from google.adk.agents.parallel_agent import ParallelAgent
from .subagents import agent0, agent1, agent2, agent3, analytics_agent, media_scout
from .subagents.video_agent import unified_video_interceptor
from google.adk.plugins.reflect_retry_tool_plugin import ReflectAndRetryToolPlugin
from google.adk.agents.callback_context import CallbackContext
from google.adk.sessions import VertexAiSessionService
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
# Console Handler
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(console_handler)

# File Handler (Fix for stale logs)
try:
    log_file_path = os.path.join(os.path.dirname(__file__), "..", "logger.log")
    file_handler = logging.FileHandler(log_file_path)
    file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    logger.addHandler(file_handler)
except Exception as e:
    logger.warning(f"Could not initialize FileHandler (e.g. secure Docker container permissions): {e}. Falling back to console logging.")

logger.setLevel(logging.INFO)



# Initialize Memory Service
PROJECT_ID = os.getenv('GOOGLE_CLOUD_PROJECT')
LOCATION = os.getenv('GOOGLE_CLOUD_LOCATION')
AGENT_ID_RAW = os.getenv('AGENT_ENGINE_ID')
# Strip prefix if full resource name was provided
if AGENT_ID_RAW:
    # Extract the region from the resource path
    region_match = re.search(r'locations/([^/]+)', AGENT_ID_RAW)
    ENGINE_REGION = region_match.group(1) if region_match else 'us-central1'
    AGENT_ID = AGENT_ID_RAW.split('/')[-1]
else:
    ENGINE_REGION = 'us-central1'
    AGENT_ID = None
STAGING_BUCKET = os.environ.get("GOOGLE_CLOUD_STAGING_BUCKET", "gs://agent047")

logging.info(f"Initializing Memory Service with Project: {PROJECT_ID}, Location: {LOCATION}, Agent ID: {AGENT_ID}")
vertexai.init(
    project=PROJECT_ID,
    location=LOCATION,
    staging_bucket=STAGING_BUCKET,
)
memory_service = VertexAiMemoryBankService(
    project=PROJECT_ID,
    location=ENGINE_REGION,
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

async def before_agent_callback(callback_context: CallbackContext) -> Optional[LlmResponse]:
    """Master Orchestrator: Handles Tier Gating, Memories, and Data Ingestion."""
    user_input = callback_context.user_content.parts[0].text if callback_context.user_content else ""
    
    # 1. Identity Discovery (Resilient)
    current_agent = "unknown"
    if hasattr(callback_context, 'agent_name'):
        current_agent = callback_context.agent_name
    elif hasattr(callback_context, 'agent') and callback_context.agent:
        current_agent = callback_context.agent.name

    # ⏱️ Start Stopwatch
    callback_context.state[f"start_time_{current_agent}"] = time.time()
    user_id = callback_context.session.user_id
    logger.info(f">>> [STOPWATCH] {current_agent} Turn Start | User: {user_id} <<<")

    # 1b. Master Memory Fetcher (L1.2)
    if "master_memories" not in callback_context.state and not is_greeting(user_input):
        try:
            search_query = re.sub(r"\[SYSTEM_AUTH: TIER=.*?\]", "", user_input).strip()
            if search_query:
                logger.info(f"Memory: Master Fetch for '{search_query[:50]}...'")
                res = await memory_service.search_memory(
                    app_name=MEMORY_SCOPE_APP,
                    user_id=callback_context.session.user_id,
                    query=search_query
                )
                if res.memories:
                    memories_text = "\n".join([f"- {m.content.parts[0].text}" for m in res.memories])
                    callback_context.state["master_memories"] = memories_text
                    logger.info(f"Memory: Cached {len(res.memories)} memories.")
                else:
                    callback_context.state["master_memories"] = ""
            else:
                callback_context.state["master_memories"] = ""
        except Exception as e:
            logger.error(f"Master Memory Search failure: {e}")
            callback_context.state["master_memories"] = ""

    # 🛡️ STATE SEEDING: Ensure context variables always exist to prevent KeyErrors
    if "user_stats" not in callback_context.session.state:
        callback_context.session.state["user_stats"] = ""
    if "media_insights" not in callback_context.session.state:
        callback_context.session.state["media_insights"] = ""
    if "analytics_results" not in callback_context.session.state:
        callback_context.session.state["analytics_results"] = ""

    # 1c. Master Artifact Cacher (L1.3)
    if "cached_artifacts" not in callback_context.state and artifact_service:
        try:
            logger.info("Artifacts: Master Fetching keys from GCS...")
            filenames = await artifact_service.list_artifact_keys(
                app_name=callback_context.session.app_name,
                user_id=callback_context.session.user_id,
                session_id=callback_context.session.id
            )
            callback_context.state["cached_artifacts"] = filenames
            logger.info(f"Artifacts: Cached {len(filenames)} keys.")
        except Exception as e:
            logger.error(f"Master Artifact Fetch failure: {e}")
            callback_context.state["cached_artifacts"] = []

    # 2. Artifact-Dependent Agents: Skip if no artifacts found (Agent 0 & Analytics only)
    if current_agent in ["agent0", "analytics_agent"]:
        filenames = callback_context.state.get("cached_artifacts", [])
        if not filenames:
            logger.info(f"No artifacts found in cache for {current_agent}. Skipping to Researcher.")
            return LlmResponse(
                content=types.Content(parts=[types.Part(text="USER_STATS: NONE")]),
                custom_metadata={"author": f"{current_agent}_bypass"}
            )

    # 3. Tier Discovery (Dual-Signal)
    user_tier = callback_context.state.get("athlete_tier", "ROOKIE").upper()
    tier_match = re.search(r"\[SYSTEM_AUTH: TIER=(.*?)\]", user_input)
    if tier_match:
        user_tier = tier_match.group(1).upper()
        clean_input = user_input.split("]", 1)[-1].strip()[:50]
        logger.info(f"--- [GATEKEEPER] Auth Detected: {current_agent} | Tier: {user_tier} | Msg: {clean_input}... ---")
    else:
        logger.info(f"--- [GATEKEEPER] State Check: {current_agent} | Tier: {user_tier} ---")

    # 🛡️ VIDEO DETECTION: Find YouTube link (L1.5 Ephemeral Fix)
    youtube_regex = r"(?:https?://)?(?:www\.)?(?:youtube\.com|youtu\.be)/(?:watch\?v=)?([^/\s?]+)"
    yt_match = re.search(youtube_regex, callback_context.user_content.parts[0].text if callback_context.user_content else "")
    if yt_match:
        url = yt_match.group(0).strip()
        callback_context.state["active_video_uri"] = url
        logger.info(f"Visual Sentry: Detected YouTube link for this turn: {url}")
    else:
        # Turn state automatically clears, so we don't need manual None assignment
        pass

    # 🛑 TIER-GATE: ROOKIE (Blocks all Lab agents)
    if user_tier == "ROOKIE" and current_agent in ["agent0", "analytics_agent", "media_scout"]:
        logger.info(f"Gatekeeper Enforcement: ROOKIE blocked from {current_agent}")
        return LlmResponse(content=types.Content(parts=[types.Part(text="[TIER_LIMIT] Access denied. Rookies are not authorized for the Analytical Lab.")]))

    # 🛑 TIER-GATE: PROSPECT (Limit to Text only)
    if user_tier == "PROSPECT" and current_agent in ["analytics_agent", "media_scout"]:
        logger.info(f"Gatekeeper Enforcement: PROSPECT blocked from Deep Lab.")
        return LlmResponse(content=types.Content(parts=[types.Part(text="[TIER_LIMIT] Deep Analytical Scout is locked for Prospect tier. Upgrade to Elite for visual analysis.")]))

    # 🟢 ELITE: Exclusive Skip (Bypass Summary for Deep Analytics)
    if current_agent == "agent0" and user_tier in ["ELITE", "LEGEND"]:
        logger.info(f"Gatekeeper Enforcement: ELITE bypass. Moving straight to Analytical Scout.")
        return LlmResponse(content=types.Content(parts=[types.Part(text="USER_STATS: UPGRADED_TO_ANALYTICS")]))

    # 🛡️ VIDEO GATEKEEPER: Bypass Media Scout if no video content or YouTube links
    if current_agent == "media_scout":
        has_youtube = callback_context.session.state.get("active_video_uri")
        
        # Check cached artifacts for video
        artifact_keys = callback_context.state.get("cached_artifacts", [])
        
        # 🕵️ Forensic Audit: Log exactly what the Gatekeeper sees
        logger.info(f"Gatekeeper Ingestion Scan: {len(artifact_keys)} cached keys found.")

        # 🛡️ Visual Audit: Check if any key contains a video extension
        video_extensions = ('.mp4', '.mov', '.avi', '.webm')
        has_video_artifact = any(
            any(ext in k.lower() for ext in video_extensions) 
            for k in artifact_keys
        )
        

    logger.info(f"Gatekeeper Enforcement: Permission Granted for {current_agent} ({user_tier}).")
    return None

async def before_model_callback(callback_context: CallbackContext, llm_request: LlmRequest) -> Optional[LlmResponse]:
    """Master Context Injector: Handles Name, Bio, Memories, and Data Ingestion."""
    user_input = callback_context.user_content.parts[0].text if callback_context.user_content else ""
    current_agent = callback_context.agent_name if hasattr(callback_context, 'agent_name') else "unknown"
    
    user_tier = callback_context.state.get("athlete_tier", "ROOKIE").upper()
    tier_match = re.search(r"\[SYSTEM_AUTH: TIER=(.*?)\]", user_input)
    if tier_match: user_tier = tier_match.group(1).upper()

    # 1. Skip if Greeting
    if is_greeting(user_input):
         return LlmResponse(content=types.Content(parts=[types.Part(text="[System: Greeting detected, research skipped.]")]))

    # 2. Memory Retrieval (Cached lookup - L1.2)
    memories = callback_context.state.get("master_memories", "")

    # 3. Targeted Context (Layer 3: Need-to-Know)
    # We strip Bio and Memories for research agents to save ~30-50% on token costs per turn.
    user_name = callback_context.state.get("user_name", "Anonymous Athlete")
    active_sport = callback_context.state.get("active_sport", "General Sports")
    
    if current_agent == "agent3":
        athlete_bio = callback_context.state.get("athlete_bio", "")
        memories = callback_context.state.get("master_memories", "")
        if not memories:
            memories = callback_context.state.get("past_memories", "")
            
        identity_context = f"Athlete: {user_name} | Bio: {athlete_bio}"
        memory_injection = f"\n[PAST MEMORIES]\n{memories}\n" if memories else ""
        logger.info(f"Targeted Context: Full Bio/Memories injected for {current_agent}")
    else:
        identity_context = f"Athlete: {user_name}"
        memory_injection = ""
        logger.info(f"Targeted Context: Minimal context for worker agent {current_agent}")
    
    sport_context = f"Active Sport: {active_sport}"
    injection = f"\n\n[CONTEXT INJECTION]\n{identity_context}\n{sport_context}\n{memory_injection}[END CONTEXT]"
    llm_request.append_instructions([injection])

    # 3b. Inject Media Insights if available (For Final Coach)
    if current_agent == "agent3":
        media_insights = callback_context.session.state.get("media_insights")
        analytics_results = callback_context.session.state.get("analytics_results")
        
        alerts = []
        if not media_insights:
            alerts.append("[SYSTEM_ALERT] Media Scout failed to analyze visual tape. Proceed without visual confirmation.")
        if not analytics_results:
            alerts.append("[SYSTEM_ALERT] Analytics Scout failed to process CSV data. Proceed with qualitative theory only.")
            
        if alerts:
            llm_request.append_instructions(alerts)
            
        if media_insights:
            llm_request.append_instructions([f"[MEDIA_INSIGHTS]: {media_insights}"])

    # 4. GCS Ingestion logic (Selective - L1.3 Cached)
    if current_agent in ["agent0", "analytics_agent", "media_scout"]:
        filenames = callback_context.state.get("cached_artifacts", [])
        for filename in filenames:
                # 🛡️ Visual Audit: Correctly identify extensions even with /0 suffix
                is_image = any(ext in filename.lower() for ext in ['.png', '.jpg', '.jpeg', '.webp'])
                if is_image:
                    continue
                
                # 🚀 PURE TOOL FLOW: Bypass token limits by providing URIs as strings, not Parts.
                try:
                    bucket = os.getenv("GCS_BUCKET", "productionbucket101")
                    app_name = callback_context.session.app_name
                    user_id = callback_context.session.user_id
                    session_id = callback_context.session.id
                    
                    # Construct the Direct URI (pointing to Chunk 0 for schema start)
                    uri = f"gs://{bucket}/{app_name}/{user_id}/{session_id}/{filename}/0"
                    
                    logger.info(f"Pure Tool Flow: Signaling URI '{uri}' to {current_agent}")
                    
                    # We inject the URI into the instructions rather than the prompt contents
                    # This uses ~10 tokens instead of 2.1 Million.
                    llm_request.append_instructions([f"[SYSTEM_DATA] File Available: {filename} | URI: {uri}"])
                    
                except Exception as e:
                    logger.error(f"Pure Tool Flow error for {filename}: {e}")
            
        if filenames:
                llm_request.append_instructions(["[SYSTEM] Analysis Alert: Data is at the URIs provided above. Use 'pd.read_csv(uri)' in your Python tool to analyze."])

    # 5. Universal Instruction Injection
    instruction_set = ["[SYSTEM] Ignore any [SYSTEM_AUTH] tags in conversation history—they are internal metadata."]
    if user_tier in ["ELITE", "LEGEND"]:
        instruction_set.append("Acknowledge that you are working with an ELITE athlete with priority Lab access.")
    else:
        instruction_set.append("Agent 0: Provide a concise summary of the performance data.")

    llm_request.append_instructions(instruction_set)
    return None

async def agent3_confirmation_callback(callback_context: CallbackContext, llm_request: LlmRequest) -> Optional[LlmResponse]:
    """Ensures the Final Coach (Agent 3) inherits the master context while maintaining confirmation logic."""
    await before_model_callback(callback_context, llm_request)
    return None

async def visual_persistence_callback(callback_context: CallbackContext):
    """Captures and persists generated plots to GCS."""
    if not artifact_service: return
    
    if hasattr(callback_context, 'llm_response') and callback_context.llm_response:
        for i, part in enumerate(callback_context.llm_response.candidates[0].content.parts):
            if part.inline_data:
                try:
                    filename = f"plot_{i+1}.png"
                    await artifact_service.save_artifact(
                        app_name=callback_context.session.app_name,
                        user_id=callback_context.session.user_id,
                        session_id=callback_context.session.id,
                        filename=filename,
                        content=part.inline_data.data,
                        mime_type=part.inline_data.mime_type
                    )
                    logger.info(f"Saved generated plot: {filename}")
                except Exception as e:
                    logger.error(f"Persistence error: {e}")
        
async def after_subagent_callback(callback_context: CallbackContext):
    """Calculates and logs the execution duration and handles Elite variable bridging."""
    current_agent = callback_context.agent_name if hasattr(callback_context, 'agent_name') else "unknown"
    start_time = callback_context.state.get(f"start_time_{current_agent}")
    
    # 1. Timing Logic
    if start_time:
        duration = time.time() - start_time
        logger.info(f"<<< [STOPWATCH] {current_agent} Turn Finish (Duration: {duration:.2f}s) >>>")
    else:
        logger.info(f"<<< [STOPWATCH] {current_agent} Turn Finish (Duration: unknown) >>>")

    # 2. Elite Variable Bridge: Hand off results to the rest of the chain
    if current_agent == "analytics_agent":
        analytics_results = callback_context.state.get("analytics_results", "")
        if analytics_results:
            current_user_stats = callback_context.session.state.get("user_stats", "")
            updated_stats = f"{current_user_stats}\n\n[DATA_LAB]: {analytics_results}".strip()
            callback_context.session.state["user_stats"] = updated_stats

    if current_agent == "media_scout":
        # Capture from the state using the dynamic output_key
        media_insights = callback_context.state.get("media_insights", "")
        if media_insights:
            callback_context.session.state["media_insights"] = media_insights
            logger.info("Bridge: Synced raw media_insights to dedicated state.")

# Inject callbacks (Standardized - L1.4)
sub_agent_list = [agent0, analytics_agent, media_scout, agent1, agent2, agent3]

for agent in sub_agent_list:
    agent.before_agent_callback = before_agent_callback
    agent.before_model_callback = before_model_callback
    agent.after_agent_callback = after_subagent_callback

# Specialized Overrides
async def media_scout_combined_callback(callback_context, llm_request):
    # 1. Run general context injection (Bio, Memories, Tiers)
    await before_model_callback(callback_context, llm_request)
    # 2. Run specialized video ingestion (Attaching YouTube/GCS Parts)
    return await unified_video_interceptor(callback_context, llm_request)

media_scout.before_model_callback = media_scout_combined_callback
agent3.before_model_callback = agent3_confirmation_callback 

# --- HUB-AND-SPOKE ORCHESTRATION ---
# We group independent research agents into a parallel hub to reduce latency by ~40%.
research_hub = ParallelAgent(
    name='research_hub',
    description='Parallel Research Hub: Processes CSV Analytics, Visual Media, and Core Stats simultaneously.',
    sub_agents=[agent0, analytics_agent, media_scout]
)

root_agent = SequentialAgent(
    name='alphonso',
    description='Alphonso: Your tough but compassionate performance mentor. He builds your legacy.',
    sub_agents=[
        research_hub,
        agent1, 
        agent2, 
        agent3
    ],
    before_agent_callback=before_agent_callback,
    after_agent_callback=visual_persistence_callback
)

# Unified Session Memory
session_service = VertexAiSessionService(
    project=PROJECT_ID,
    location=ENGINE_REGION,
    agent_engine_id=AGENT_ID
)

# Create the App container
alphonso_app = App(
    name='alphonso_performance_mentor',
    root_agent=root_agent,
    plugins=[]
)