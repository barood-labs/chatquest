#!/usr/bin/env bash
# Smoke-test ChatQuest without a live Twitch connection.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PORT="${PORT:-3010}"
export PORT
export CHATQUEST_MOCK=1
# Keep Twitch vars out of the process so the bot never connects even if .env has them.
env -u TWITCH_BOT_TOKEN -u TWITCH_CLIENT_ID -u TWITCH_CLIENT_SECRET \
  CHATQUEST_MOCK=1 PORT="$PORT" \
  node src/server.js > /tmp/chatquest-smoke.log 2>&1 &
PID=$!
cleanup() { kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; }
trap cleanup EXIT

for i in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${PORT}/api/state" >/dev/null; then break; fi
  sleep 0.1
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "server died"; cat /tmp/chatquest-smoke.log; exit 1
  fi
done

curl -sf "http://127.0.0.1:${PORT}/overlay/" | grep -q ChatQuest
curl -sf "http://127.0.0.1:${PORT}/overlay/overlay.js" | grep -q WebSocket

STATE=$(curl -sf -X POST "http://127.0.0.1:${PORT}/api/test/quest")
echo "$STATE" | grep -q '"type":"quest"'
echo "$STATE" | grep -q '"title"'

JOIN=$(curl -sf -X POST "http://127.0.0.1:${PORT}/api/test/join?user=alice")
echo "$JOIN" | grep -q '"ok":true'

ROLL=$(curl -sf -X POST "http://127.0.0.1:${PORT}/api/test/roll?user=bob")
echo "$ROLL" | grep -q '"die"'

CUR=$(curl -sf "http://127.0.0.1:${PORT}/api/state")
echo "$CUR" | grep -q '"progress"'

# Drive to completion (goal <= 25, each roll 1-6)
for i in $(seq 1 30); do
  OUT=$(curl -sf -X POST "http://127.0.0.1:${PORT}/api/test/roll?user=finisher")
  if echo "$OUT" | grep -q '"completed":true'; then break; fi
  if echo "$OUT" | grep -q '"reason":"no_quest"'; then break; fi
done

FINAL=$(curl -sf "http://127.0.0.1:${PORT}/api/state")
echo "$FINAL" | grep -q '"quest":null'

echo "SMOKE OK"
