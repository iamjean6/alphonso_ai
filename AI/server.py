import os
from dotenv import load_dotenv
load_dotenv() 

import logging
from datetime import timedelta, datetime
from typing import Optional
import json
import uuid

from fastapi import FastAPI, Depends, HTTPException, Security, Body, Header, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from fastapi.security.api_key import APIKeyHeader
from pydantic import BaseModel

from google.cloud import storage
from google.adk import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from google.adk.events.event import Event
from google.adk.agents.run_config import RunConfig, StreamingMode

# Initialize Logger
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

def configure_bucket_cors():
    """
    Automates the CORS configuration for the Visual Lab.
    BTS: Programmatically tells GCS to trust our local dev environment.
    This eliminates the 'Network Error' blockade.
    """
    try:
        bucket_name = os.getenv("GCS_BUCKET")
        if not bucket_name:
            logger.warning("Auto-CORS: GCS_BUCKET not set. Skipping configuration.")
            return

        # BTS: Service Account needs 'Storage Admin' or 'Storage Legacy Bucket Owner'
        client = storage.Client()
        bucket = client.get_bucket(bucket_name)

        # Define the clearance for our local dev environment
        # We allow localhost:5173 (Vite) and localhost:3000 (Node)
        policies = [
            {
                "origin": ["http://localhost:5173", "http://localhost:3000"],
                "method": ["GET", "PUT", "POST", "DELETE", "OPTIONS"],
                "responseHeader": ["Content-Type", "X-Requested-With", "Authorization"],
                "maxAgeSeconds": 3600
            }
        ]

        bucket.cors = policies
        bucket.patch()
        logger.info(f"🦾 Security Clearance: CORS authorized for {bucket_name}")

    except Exception as e:
        logger.error(f"🚨 Auto-CORS Failure: {e}. Ensure Service Account has Bucket Admin roles.")

# Run Auto-Configuration
configure_bucket_cors()

# Import the pre-configured app and services from our agent module
from adk_agent.agent import alphonso_app, memory_service, artifact_service, session_service

# 1. We initialize the application. This is the "brain" of our web server.
app = FastAPI(title="Agent Microservice", description="FastAPI Server for our AI Agent")

# -----------------------------------------------------------------------------
# STAGE 2: THE LOCK ON THE BIKE (SECURITY)
# -----------------------------------------------------------------------------
INTERNAL_API_KEY = "super-secret-key-for-node-only" 
api_key_header = APIKeyHeader(name="X-Internal-Token", auto_error=False)

def verify_internal_node_service(api_key: str = Security(api_key_header)):
    """This function acts as a bouncer at the door of our API."""
    if api_key != INTERNAL_API_KEY:
        raise HTTPException(
            status_code=403, 
            detail="Forbidden: You are not the Node.js server! Pay up!"
        )
    return api_key

# -----------------------------------------------------------------------------
# STAGE 3: THE ENGINE ROOM (ADK RUNNER)
# -----------------------------------------------------------------------------
runner = Runner(
    app=alphonso_app,
    session_service=session_service,
    memory_service=memory_service,
    artifact_service=artifact_service
)

# -----------------------------------------------------------------------------
# ROUTES
# -----------------------------------------------------------------------------

@app.get("/health")
async def health_check():
    """Verify the server is running."""
    return {"status": "ok", "message": "Training wheels are on! Server is ready."}

class ChatRequest(BaseModel):
    message: str
    user_id: str
    session_id: Optional[str] = None
    active_sport: Optional[str] = "basketball"
    athlete_bio: Optional[str] = None
    tier: Optional[str] = "ELITE"

@app.post("/chat", dependencies=[Depends(verify_internal_node_service)])
async def chat_endpoint(request: ChatRequest):
    """
    Main entry point for interacting with the Alphonso Agent using Server-Sent Events.
    """
    user_id = request.user_id
    session_id = request.session_id or f"sess-{uuid.uuid4().hex[:8]}"
    
    # We wrap everything inside an async generator
    async def event_generator():
        try:
      
            
            # 1. Ensure the session exists in ADK's session service
            existing_sessions_response = await session_service.list_sessions(app_name=alphonso_app.name, user_id=user_id)
            if not any(s.id == session_id for s in existing_sessions_response.sessions):
                await session_service.create_session(
                    app_name=alphonso_app.name,
                    user_id=user_id,
                    session_id=session_id
                )
            
            # 1b. Inject the active_sport and athlete_bio into session state if provided
            if request.active_sport or request.athlete_bio:
                active_session = await session_service.get_session(
                    app_name=alphonso_app.name,
                    user_id=user_id,
                    session_id=session_id
                )
                active_session.state["athlete_tier"] = request.tier.upper()

                if request.active_sport:
                    active_session.state["active_sport"] = request.active_sport
                if request.athlete_bio:
                    active_session.state["athlete_bio"] = request.athlete_bio
            
            active_session.state["turn_context_loaded"] = False
            
            # 2. Run the agent with native streaming (Asynchronous)
            auth_stamped_message = f"[SYSTEM_AUTH: TIER={request.tier.upper()}]\n{request.message}"
            print(f"DEBUG: [INCOMING SIGNAL] Message: {request.message[:50]}... | Tier: {request.tier}")
            print(f"Executing Agent for User: {user_id}, Session: {session_id}")
            
            run_config = RunConfig(streaming_mode=StreamingMode.SSE)
            
            final_text = ""
            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=types.Content(parts=[types.Part(text=auth_stamped_message)]),
                run_config=run_config
            ):
                if hasattr(event, 'content') and event.content:
                    if event.author == 'alphonso':
                        for part in event.content.parts:
                            if part.text:
                                chunk = part.text
                                
                                # ADK native streaming yields individual chunks
                                if event.partial:
                                    # Log agent transition for visibility
                                    if event.author:
                                        logger.info(f"--- [ADK FLOW] Agent Active: {event.author} ---")
                                    
                                    yield f"data: {json.dumps({'type': 'content', 'chunk': chunk})}\n\n"
                                    final_text += chunk
                                else:
                                    # Final non-partial event might contain the full text or just the last part
                                    final_text = chunk
                                
            # 4. Memory Persistence happens AFTER the response stream finishes its text
            if final_text:
                try:
                    active_session = await session_service.get_session(app_name=alphonso_app.name, user_id=user_id, session_id=session_id)
                    user_id_override = active_session.state.get("user_id_override")
                    target_user_id = user_id_override if user_id_override and user_id_override != "Unknown" else user_id
                    
                    logger.info(f"[Server] Attempting to save memory to {target_user_id} in {alphonso_app.name}")
                    save_events = [
                        Event(author="user", content=types.Content(role="user", parts=[types.Part(text=request.message)])),
                        Event(author="model", content=types.Content(role="model", parts=[types.Part(text=final_text)]))
                    ]
                    if hasattr(memory_service, "add_events_to_memory"):
                        await memory_service.add_events_to_memory(app_name=alphonso_app.name, user_id=target_user_id, events=save_events)
                    logger.info(f"[Server] Memory successfully saved for {target_user_id}!")
                except Exception as mem_err:
                    logger.error(f"[Server] Failed to save memory dynamically: {mem_err}", exc_info=True)
            
            # Let Node.js know the stream is complete
            yield f"data: {json.dumps({'type': 'status', 'status': 'DONE'})}\n\n"
            
        except Exception as e:
            logging.error(f"Error in chat endpoint generator: {e}", exc_info=True)
            # Send an error chunk to Node.js before closing
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    # Step 5: Instead of returning JSON, return the streaming generator
    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/get_upload_url", dependencies=[Depends(verify_internal_node_service)])
async def get_upload_url(
    filename: str,
    content_type: str = "application/octet-stream",
    user_id: str = Header(..., alias="X-User-ID"),
    session_id: str = Header(..., alias="X-Session-ID")
):
    """
    Step 1: Generate a GCS Signed URL.
    BTS: This requires a Service Account with 'serviceAccountTokenCreator' role 
    or a local JSON key file. Signed URLs cannot be generated with User Credentials.
    """
    try:
        # BTS: We initialize the client inside the request to pick up fresh env vars
        client = storage.Client()
        bucket_name = os.getenv("GCS_BUCKET")
        
        if not bucket_name:
            logger.error("Visual Lab Configuration Error: GCS_BUCKET not set in .env")
            raise HTTPException(status_code=500, detail="Cloud Storage bucket not configured.")

        bucket = client.bucket(bucket_name)
        app_name = alphonso_app.name

        # Construct the GCS path (matches ADK schema for artifact discovery)
        blob_path = f"{app_name}/{user_id}/{session_id}/{filename}/0"
        blob = bucket.blob(blob_path)

        # 🚀 Generate the Signed URL
        # BTS: Version v4 is the industry standard. Expiration is 15 mins.
        try:
            url = blob.generate_signed_url(
                version="v4",
                expiration=timedelta(minutes=15),
                method="PUT",
                content_type=content_type,
            )
        except AttributeError as e:
            # This happens when using User Credentials instead of a Service Account
            logger.error(f"Auth Error: {e}")
            raise HTTPException(
                status_code=500, 
                detail="The Lab needs a Service Account Key to sign upload URLs. Please set GOOGLE_APPLICATION_CREDENTIALS to a Service Account JSON file."
            )

        logger.info(f"Visual Lab Handshake: Signed URL issued for {filename}")
        return {
            "upload_url": url, 
            "blob_path": blob_path,
            "filename": filename
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Critical Gateway Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    

    