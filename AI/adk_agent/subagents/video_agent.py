import os
import re
import logging
from typing import Optional
from dotenv import load_dotenv
from google.adk.agents.llm_agent import LlmAgent
from google.adk.models.google_llm import Gemini
from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmRequest, LlmResponse
from google.genai import types
from google.cloud import storage

from adk_agent.subagents.prompt import return_instructions_media

# Setup logging
logger = logging.getLogger("MediaScout")
load_dotenv()

import time

async def unified_video_interceptor(callback_context: CallbackContext, llm_request: LlmRequest) -> Optional[LlmResponse]:
    """
    Unified interceptor that detects YouTube links AND GCS video artifacts.
    Attaches them as multimodal Parts for native Gemini vision processing.
    """
    # 🏁 Audit Start: Track ingestion time
    callback_context.session.state["_media_scout_start"] = time.time()
    
    # 1. State-Based YouTube Detection (L1.5 Turn-Based Fix)
    url = callback_context.state.get("active_video_uri")
    
    if url:
        last_message = llm_request.contents[-1] if llm_request.contents else None
        if last_message:
            already_attached = any(p.file_data and p.file_data.file_uri == url for p in last_message.parts if p.file_data)
            if not already_attached:
                video_part = types.Part.from_uri(file_uri=url, mime_type="video/mp4")
                last_message.parts.append(video_part)

    try:
        # [L1.3 Optimization] Use cached artifacts from state instead of re-listing
        artifact_keys = callback_context.state.get("cached_artifacts", [])
        
        client = storage.Client()
        bucket_name = os.getenv("GCS_BUCKET", "productionbucket101")
        bucket = client.bucket(bucket_name)
        app_name = callback_context.session.app_name
        user_id = callback_context.session.user_id
        session_id = callback_context.session.id

        for filename in artifact_keys:
            if filename.lower().endswith(('.mp4', '.mov', '.webm', '.csv', '.json')):
                # 🛡️ Visual Audit: Wide-Search for the tape
                # Try both the high-performance /0 schema and the raw filename
                paths_to_check = [
                    f"{app_name}/{user_id}/{session_id}/{filename}/0",
                    f"{app_name}/{user_id}/{session_id}/{filename}",
                    filename # Fallback for direct keys
                ]
                
                verified_path = None
                for p in paths_to_check:
                    blob = bucket.blob(p)
                    if blob.exists():
                        verified_path = p
                        break
                
                if not verified_path:
                    logger.warning(f"Media Scout Audit: Tape found in manifest but blob missing in GCS: {filename}")
                    continue

                gs_uri = f"gs://{bucket_name}/{verified_path}"
                
                mime_type = "video/mp4" if filename.lower().endswith(('.mp4', '.mov', '.webm')) else "text/csv"
                gcs_part = types.Part.from_uri(file_uri=gs_uri, mime_type=mime_type)
                
                if llm_request.contents:
                    llm_request.contents[-1].parts.append(gcs_part)
                    
    except Exception as e:
        logger.error(f"🚨 Media Scout Audit Failure: {e}")

    return None

async def media_scout_audit_report(callback_context: CallbackContext, llm_response: LlmResponse) -> LlmResponse:
    """
    Visual Audit Post-Processor. Logs the duration and quality of the analysis.
    """
    start_time = callback_context.session.state.get("_media_scout_start", time.time())
    duration = time.time() - start_time
    
    insights = llm_response.content.parts[0].text if llm_response.content.parts else ""
    
    # Check if the mandatory timestamps are present
    if "At " not in insights and ":" not in insights:
        logger.warning("🚨 Visual Audit WARNING: Agent failed to provide timestamped evidence!")
        
    return llm_response

media_scout = LlmAgent(
    model=Gemini(model='gemini-2.5-flash', retry_options=types.HttpRetryOptions(initial_delay=2, attempts=5)),
    name='media_scout',
    description='Specialized assistant that analyzes YouTube videos and GCS footage.',
    instruction=return_instructions_media(),
    output_key="media_insights"
)

# Register the Visual Audit handshakes
media_scout.before_model_callback = unified_video_interceptor
media_scout.after_model_callback = media_scout_audit_report
