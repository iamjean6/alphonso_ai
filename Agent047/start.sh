#!/bin/sh

# Start the Node.js backend in the background
echo "Starting Node.js Backend..."
cd /app/backend && node index.js &

# Start Nginx in the foreground
echo "Starting Nginx Proxy..."
nginx -g "daemon off;"
