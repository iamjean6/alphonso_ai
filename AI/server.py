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
from google.cloud import storage

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
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        backend_url = os.getenv("BACKEND_URL", "http://localhost:3000")
        policies = [
            {
                "origin": [frontend_url, backend_url],
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

# Run Auto-Configuration (Gated for Production Safety)
if os.getenv("CORS_ENABLED") == "true":
    configure_bucket_cors()

# Import the pre-configured app from our agent module for path resolution
from adk_agent.agent import alphonso_app

# 1. We initialize the application. This is the "brain" of our web server.
app = FastAPI(title="Agent Microservice", description="FastAPI Server for our AI Agent")

# -----------------------------------------------------------------------------
# STAGE 2: THE LOCK ON THE BIKE (SECURITY)
# -----------------------------------------------------------------------------
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY")
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
# STAGE 3: THE ENGINE ROOM (MIGRATED TO WORKER DAEMON)
# -----------------------------------------------------------------------------
# Note: ADK Runner execution has been offloaded to worker.py via Kafka queue.

# -----------------------------------------------------------------------------
# ROUTES
# -----------------------------------------------------------------------------

@app.get("/health")
async def health_check():
    """Verify the server is running."""
    return {"status": "ok", "message": "Training wheels are on! Gateway Server is ready."}

@app.post("/chat", dependencies=[Depends(verify_internal_node_service)])
async def chat_endpoint_deprecated():
    """
    DEPRECATED: Multi-agent AI execution has been migrated to the asynchronous Kafka worker daemon (worker.py).
    Tasks must be produced to the 'ai-chat-requests' Kafka topic.
    """
    raise HTTPException(
        status_code=410,
        detail="Endpoint deprecated. Alphonso AI workflows are now processed asynchronously via Kafka message queue."
    )



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
    

    