import os
import subprocess
import sys

# Write the JSON credentials from Railway environment variable to the required file
json_content = os.environ.get("GOOGLE_CREDENTIALS_JSON")
if json_content:
    # Ensure the directory exists
    os.makedirs("adk_agent", exist_ok=True)
    
    # Write the file securely
    with open("adk_agent/agent047-492613-659979de03c3.json", "w") as f:
        f.write(json_content)
    print("Successfully wrote Google Cloud credentials from environment variable.")
else:
    print("WARNING: GOOGLE_CREDENTIALS_JSON environment variable not found.")

# Start the uvicorn server
print("Starting Uvicorn server...")
sys.exit(subprocess.call(["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]))
