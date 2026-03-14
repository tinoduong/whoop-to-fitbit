#!/bin/bash
# Start the Fitness Dashboard webapp

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8080

# Kill any existing instance on the port
if lsof -ti:$PORT > /dev/null 2>&1; then
  echo "Stopping existing server on port $PORT..."
  lsof -ti:$PORT | xargs kill -9 2>/dev/null
  sleep 0.5
fi

echo "Starting Fitness Dashboard at http://localhost:$PORT"
cd "$SCRIPT_DIR"
python3 app.py &
SERVER_PID=$!

sleep 0.8
open "http://localhost:$PORT"

echo "Server running (PID $SERVER_PID). Press Ctrl+C to stop."
wait $SERVER_PID
