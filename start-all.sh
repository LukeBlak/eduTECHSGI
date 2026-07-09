#!/bin/bash
# Master watchdog: keeps BOTH the Next.js dev server (port 3000) and the
# realtime WebSocket service (ports 3003/3004) alive, auto-restarting them
# if they crash. Designed to survive parent shell termination in the k8s
# sandbox — must be launched with `setsid ./start-all.sh </dev/null >/dev/null 2>&1 &`.
cd /home/z/my-project

DEV_LOG=/home/z/my-project/dev.log
RT_LOG=/home/z/my-project/mini-services/realtime-service/dev.log

# Kill any previous instances.
pkill -f "next-server" 2>/dev/null
pkill -f "bun run dev" 2>/dev/null
pkill -f "realtime-service/index.ts" 2>/dev/null
sleep 1

run_dev() {
  cd /home/z/my-project
  while true; do
    bun run dev
    echo "[watchdog] dev server exited ($?), restarting in 2s..." >> "$DEV_LOG"
    sleep 2
  done
}

run_realtime() {
  cd /home/z/my-project/mini-services/realtime-service
  while true; do
    bun run dev
    echo "[watchdog] realtime exited ($?), restarting in 2s..." >> "$RT_LOG"
    sleep 2
  done
}

# Launch both loops in parallel, each in its own background subshell.
run_dev > "$DEV_LOG" 2>&1 < /dev/null &
DEVPID=$!
disown $DEVPID 2>/dev/null

run_realtime > "$RT_LOG" 2>&1 < /dev/null &
RTPID=$!
disown $RTPID 2>/dev/null

echo "dev watchdog pid=$DEVPID, realtime watchdog pid=$RTPID"

# Wait for both to come up (max 40s).
for i in $(seq 1 20); do
  sleep 2
  dev_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3000/ 2>/dev/null)
  rt_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3004/__health 2>/dev/null)
  echo "[wait ${i}x2s] dev=$dev_code realtime=$rt_code"
  if [ "$dev_code" = "200" ] && [ "$rt_code" = "200" ]; then
    echo "BOTH READY"
    exit 0
  fi
done
echo "TIMEOUT (dev=$dev_code rt=$rt_code)"
exit 1
