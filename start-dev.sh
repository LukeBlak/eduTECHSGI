#!/bin/bash
# Robust dev server launcher with auto-restart.
# Designed to survive parent shell termination.
cd /home/z/my-project

LOG=/home/z/my-project/dev.log
PIDFILE=/home/z/my-project/dev.pid

# Kill any existing dev server
if [ -f "$PIDFILE" ]; then
  OLD=$(cat "$PIDFILE")
  [ -n "$OLD" ] && kill "$OLD" 2>/dev/null
  rm -f "$PIDFILE"
fi
pkill -f "next-server" 2>/dev/null
pkill -f "bun run dev" 2>/dev/null
sleep 1

# Launch dev server, detached, with auto-restart loop.
# We use a `while true` loop so if Next crashes it comes back.
nohup bash -c '
  cd /home/z/my-project
  while true; do
    bun run dev
    echo "[watchdog] dev server exited ($?), restarting in 2s..." >> /home/z/my-project/dev.log
    sleep 2
  done
' > "$LOG" 2>&1 < /dev/null &

WPID=$!
echo "$WPID" > "$PIDFILE"
disown $WPID 2>/dev/null

# Wait for the HTTP endpoint to come up
for i in $(seq 1 20); do
  sleep 2
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3000/ 2>/dev/null)
  if [ "$code" = "200" ]; then
    echo "READY after ${i}x2s (HTTP 200), watchdog pid=$WPID"
    exit 0
  fi
done
echo "TIMEOUT waiting for server"
exit 1
