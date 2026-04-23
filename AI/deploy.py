import os
from dotenv import load_dotenv

# Load environment variables from the agent's .env file
load_dotenv("adk_agent/.env")

import vertexai
from adk_agent.agent import root_agent
from vertexai import agent_engines
from vertexai.preview import reasoning_engines

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "agent047-492613")
LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
STAGING_BUCKET = os.environ.get("GOOGLE_CLOUD_STAGING_BUCKET", "gs://agent047")

# Ensure these are set for the agent logic
os.environ["PROJECT_ID"] = PROJECT_ID
os.environ["LOCATION"] = LOCATION

vertexai.init(
    project=PROJECT_ID,
    location=LOCATION,
    staging_bucket=STAGING_BUCKET,
)

app = reasoning_engines.AdkApp(
    agent=root_agent,
    enable_tracing=True,
)

print("Starting fresh deployment for CI/CD...")
remote_app = agent_engines.create(
    agent_engine=app,
    requirements=[
        "google-cloud-aiplatform[adk,agent_engines]",
        "google-adk",
        "google-genai",
        "pydantic",
        "python-dotenv",
        "requests",
        "absl-py",
        "cloudpickle",
        "opentelemetry-exporter-gcp-trace",
    ],
    env_vars=[
        "GOOGLE_GENAI_USE_VERTEXAI",
        "YOUTUBE_API_KEY",
        "BUCKET_NAME",
        "PROJECT_ID",
        "LOCATION",
        "AGENT_ENGINE_ID",
    ],
    extra_packages=["./adk_agent"],
)

new_id = remote_app.resource_name
print(f"Deployment successful! New Resource ID: {new_id}")

# AUTOMATION: Update .env with the new stable pointer
env_file_path = "adk_agent/.env"
try:
    with open(env_file_path, "r") as f:
        lines = f.readlines()
    
    with open(env_file_path, "w") as f:
        found_stable = False
        found_id = False
        for line in lines:
            if line.startswith("STABLE_AGENT_ENGINE_ID="):
                f.write(f"STABLE_AGENT_ENGINE_ID={new_id}\n")
                found_stable = True
            elif line.startswith("AGENT_ENGINE_ID="):
                f.write(f"AGENT_ENGINE_ID={new_id}\n")
                found_id = True
            else:
                f.write(line)
        if not found_stable:
            f.write(f"STABLE_AGENT_ENGINE_ID={new_id}\n")
        if not found_id:
            f.write(f"AGENT_ENGINE_ID={new_id}\n")
    print(f"Updated {env_file_path} with the new STABLE_AGENT_ENGINE_ID and AGENT_ENGINE_ID.")
except Exception as e:
    print(f"Warning: Failed to auto-update .env file: {e}")

print(f"Remote app ready for use: {new_id}")
