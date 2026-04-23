from fastapi import FastAPI, Depends, HTTPException, Security, Body
from fastapi.security.api_key import APIKeyHeader
from pydantic import BaseModel
from typing import Optional
import uuid
import logging
from fastapi.responses import StreamingResponse
import json
from google.adk import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from google.adk.events.event import Event
from google.adk.agents.run_config import RunConfig, StreamingMode
from fastapi import UploadFile, File, Form
# Import the pre-configured app and services from our agent module
from adk_agent.agent import alphonso_app, memory_service, artifact_service

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
session_service = InMemorySessionService()

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
    active_sport: Optional[str] = None
    athlete_bio: Optional[str] = None

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
                if request.active_sport:
                    active_session.state["active_sport"] = request.active_sport
                if request.athlete_bio:
                    active_session.state["athlete_bio"] = request.athlete_bio
            
            # Send the initial connection chunk with session ID
            yield f"data: {json.dumps({'type': 'metadata', 'session_id': session_id})}\n\n"
            
            # 2. Run the agent with native streaming (Asynchronous)
            print(f"Executing Agent for User: {user_id}, Session: {session_id}")
            
            run_config = RunConfig(streaming_mode=StreamingMode.SSE)
            
            final_text = ""
            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=types.Content(parts=[types.Part(text=request.message)]),
                run_config=run_config
            ):
                if hasattr(event, 'content') and event.content:
                    if event.author == 'alphonso':
                        for part in event.content.parts:
                            if part.text:
                                chunk = part.text
                                
                                # ADK native streaming yields individual chunks
                                if event.partial:
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
                    
                    logging.info(f"[Server] Attempting to save memory to {target_user_id} in {alphonso_app.name}")
                    save_events = [
                        Event(author="user", content=types.Content(role="user", parts=[types.Part(text=request.message)])),
                        Event(author="model", content=types.Content(role="model", parts=[types.Part(text=final_text)]))
                    ]
                    if hasattr(memory_service, "add_events_to_memory"):
                        await memory_service.add_events_to_memory(app_name=alphonso_app.name, user_id=target_user_id, events=save_events)
                    logging.info(f"[Server] Memory successfully saved for {target_user_id}!")
                except Exception as mem_err:
                    logging.error(f"[Server] Failed to save memory dynamically: {mem_err}", exc_info=True)
            
            # Let Node.js know the stream is complete
            yield f"data: {json.dumps({'type': 'status', 'status': 'DONE'})}\n\n"
            
        except Exception as e:
            logging.error(f"Error in chat endpoint generator: {e}", exc_info=True)
            # Send an error chunk to Node.js before closing
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    # Step 5: Instead of returning JSON, return the streaming generator
    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/stats_upload", dependencies=[Depends(verify_internal_node_service)])
async def stats_upload_endpoint( 
    file_upload: UploadFile = File(...),
    user_id: str = Form(...),
    session_id: str = Form(...) 
):
    """
    Endpoint to upload athlete performance data (CSV, JSON, etc.) to GCS.
    """
    data = await file_upload.read()
    
    try:
        # Wrap the binary data into an ADK/GenAI Part
        artifact = types.Part(
            inline_data=types.Blob(
                data=data, 
                mime_type=file_upload.content_type or "application/octet-stream"
            )
        )
        
        # Save to GCS via the pre-configured artifact service
        version = await artifact_service.save_artifact(
            app_name=alphonso_app.name,
            user_id=user_id,
            session_id=session_id,
            filename=file_upload.filename,
            artifact=artifact
        )
        
        logging.info(f"Successfully uploaded {file_upload.filename} (v{version}) for user {user_id}")
        
        return {
            "status": "success",
            "filename": file_upload.filename,
            "version": version,
            "message": "Stats successfully indexed for Alphonso's analysis."
        }
    except Exception as e:
        logging.error(f"Error uploading stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal Server Error during file upload: {str(e)}")
    

    