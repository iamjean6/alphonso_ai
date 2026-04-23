import os
import sys
import time

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

import vertexai
from actions import (
    create_session,
    delete_session,
    get_session,
    list_deployments,
    list_sessions,
    send_message,
)
from google.adk.memory import VertexAiMemoryBankService
from google.adk.events.event import Event
from google.genai import types
import asyncio

# Get deployment settings from environment variables
PROJECT_ID = os.environ.get("PROJECT_ID", "agent047-492613")
LOCATION = os.environ.get("LOCATION", "us-central1")
STAGING_BUCKET = os.environ.get("GOOGLE_CLOUD_STAGING_BUCKET", "gs://agent047")

vertexai.init(
    project=PROJECT_ID,
    location=LOCATION,
    staging_bucket=STAGING_BUCKET,
)

if __name__ == "__main__":
    print("Listing deployments...")
    deployments = list_deployments()

    if not deployments:
        print("No deployments found. Exiting.")
        sys.exit(1)

    remote_app = deployments[0]
    resource_id = remote_app.resource_name
    user_id = "Jean"
    session_id = None

    print(f"Using deployment: {resource_id}")

    # List all sessions
    print("\nListing sessions...")
    sessions = list_sessions(resource_id, user_id)
    print(f"sessions: {sessions}")

    if not sessions:
        print(f"No sessions found. Creating session for user {user_id}...")
        session = create_session(resource_id, user_id)
        time.sleep(1)

        if not session:
            print("Failed to create session. Exiting.")
            sys.exit(1)
        else:
            session_id = session["id"]
            print(f"Session created: {session_id}")
    else:
        print(f"Found {len(sessions)} sessions.")
        session = sessions[0]
        # Get the first session ID
        session_id = session["id"]
        print(f"Using existing session ID: {session_id}")
        # Get the session object
    # Get session details
    print("\nGetting session details...")
    session_info = get_session(resource_id, user_id, session_id)

    if not session_info:
        print("Failed to get session details. Continuing with other operations.")
        sys.exit(1)

    print("\nSending message...")

    user_query = "who is my favorite player?"
    
    events = send_message(
        resource_id,
        user_id,
        session_id,
        message=user_query,
    )

    print("\n[DEBUG] Saving and Searching Memory Bank directly...")
    async def process_memories():
        agent_id = resource_id.split('/')[-1]
        memory_service = VertexAiMemoryBankService(
            project=PROJECT_ID,
            location=LOCATION,
            agent_engine_id=agent_id
        )
        
        # 1. Extract the final response from the agent
        final_model_text = ""
        for ev in reversed(events):
            if hasattr(ev, 'content') and ev.content and hasattr(ev.content, 'parts') and ev.content.parts:
                for part in ev.content.parts:
                    if hasattr(part, 'text') and part.text:
                        final_model_text = part.text
                        break
            elif isinstance(ev, dict) and 'content' in ev and 'parts' in ev['content']:
                # Handle Dict fallback if event is returned as dictionary
                for part in ev['content']['parts']:
                    if 'text' in part and part['text']:
                        final_model_text = part['text']
                        break
            if final_model_text:
                break
                
        if not final_model_text:
            final_model_text = "I have noted this information."
            
        print(f"\nExtracted Model Response for saving: '{final_model_text}'")
        
        # 2. SAVE THE MEMORY DIRECTLY
        print("\n--- [1] Saving session to memory bank ---")
        save_events = [
            Event(
                author="user",
                content=types.Content(role="user", parts=[types.Part(text=user_query)])
            ),
            Event(
                author="model",
                content=types.Content(role="model", parts=[types.Part(text=final_model_text)])
            )
        ]
        
        app_names = ["alphonso_sports_mentor", agent_id]
        
        # We save under the explicit App Name matching what is registered in your Agent
        save_scope = "alphonso_sports_mentor"
        try:
            print(f"Manually saving to Vertex Memory Bank under scope: {save_scope}")
            await memory_service.add_events_to_memory(
                app_name=save_scope,
                user_id=user_id,
                events=save_events,
                custom_metadata={"wait_for_completion": True}
            )
            print("Successfully saved! Sleeping 15s for Vertex Search Indexing to complete...")
            await asyncio.sleep(15)
        except Exception as e:
            print(f"Failed to save manually: {e}")
        
        # 3. SEARCH MEMORIES
        print("\n--- [2] Searching Memory Bank ---")
        for app_scope in app_names:
            print(f"Checking memories for '{user_id}' in scope: '{app_scope}'...")
            try:
                res = await memory_service.search_memory(
                    app_name=app_scope,
                    user_id=user_id,
                    query="What is my favorite player's name?"
                )
                if res.memories:
                    print(f"Found {len(res.memories)} memories!")
                    for m in res.memories:
                        try:
                            print(f" - {m.content.parts[0].text}")
                        except UnicodeEncodeError:
                            print(f" - {str(m.content.parts[0].text).encode('ascii', 'backslashreplace').decode('ascii')}")
                else:
                    print("No memories found.")
            except Exception as e:
                print(f"Error checking memory scope {app_scope}: {e}")

    # Run the memory check
    try:
        current_loop = asyncio.get_running_loop()
        current_loop.create_task(process_memories())
    except RuntimeError:
        asyncio.run(process_memories())
