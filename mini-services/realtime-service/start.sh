#!/bin/bash
# Robust realtime-service launcher with auto-restart.
cd /home/z/my-project/mini-services/realtime-service

LOG=/home/z/my-project/mini-services/realtime-service/dev.log
PIDFILE=/home/z/my-project/mini-services/realtime-service/dev.pid

if [ -f "$PIDFILE" ]; then
  OLD=$(cat "$PIDFILE")
  [ -n "$OLD" ] && kill "$OLD" 2>/dev/null
  rm -f "$PIDFILE"
fi
pkill -f "realtime-service/index.ts" 2>/dev/null
sleep 1

nohup bash -c '
  cd /home/z/my-project/mini-services/realtime-service
  while true; do
    bun run dev
    echo "[watchdog] realtime exited ($?), restarting in 2s..." >> /home/z/my-project/mini-services/realtime-service/dev.log
    sleep 2
  done
' > "$LOG" 2>&1 < /dev/null &

WPID=$!
echo "$WPID" > "$PIDFILE"
disown $WPID 2>/dev/null

for i in $(seq 1 15); do
  sleep 1
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3003/__health 2>/dev/null)
  if [ "$code" = "200" ]; then
    echo "realtime READY (HTTP $code), watchdog pid=$WPID"
    exit 0
  fi
done
echo "TIMEOUT waiting for realtime"
exit 1
