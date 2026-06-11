import os
import signal
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

# Start the Kafka worker daemon in the background before Uvicorn
print("Starting Kafka worker daemon (worker.py)...")
worker_proc = subprocess.Popen([sys.executable, "worker.py"])
print(f"Kafka worker started (PID {worker_proc.pid}).")


def _shutdown(signum, frame):
    """Gracefully terminate the worker when this process receives a signal."""
    print(f"Received signal {signum}, shutting down worker (PID {worker_proc.pid})...")
    worker_proc.terminate()
    try:
        worker_proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        worker_proc.kill()
    sys.exit(0)


signal.signal(signal.SIGTERM, _shutdown)
signal.signal(signal.SIGINT, _shutdown)

# Start the Uvicorn server in the foreground (blocks until exit)
print("Starting Uvicorn server...")
uvicorn_exit = subprocess.call(["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"])

# Uvicorn exited — bring the worker down too
print("Uvicorn exited, stopping Kafka worker...")
worker_proc.terminate()
try:
    worker_proc.wait(timeout=10)
except subprocess.TimeoutExpired:
    worker_proc.kill()

sys.exit(uvicorn_exit)
