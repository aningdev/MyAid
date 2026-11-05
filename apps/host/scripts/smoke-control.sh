#!/usr/bin/env bash
# Host control smoke: serve → ensureDsh → connectionInfo → /connect cookie → stopDsh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
BIN="${CARGO_TARGET_DIR:-$ROOT/target}/debug/myaid-host"
DATA="$(mktemp -d /tmp/myaid-smoke-XXXX)"
SOCK="$DATA/host/control.sock"
cleanup() {
  if [[ -n "${HOST_PID:-}" ]]; then kill "$HOST_PID" 2>/dev/null || true; wait "$HOST_PID" 2>/dev/null || true; fi
  rm -rf "$DATA"
}
trap cleanup EXIT

cargo build -p myaid-host -q
"$BIN" serve --data-root "$DATA" --official-dsh &
HOST_PID=$!
for _ in $(seq 1 50); do [[ -S "$SOCK" ]] && break; sleep 0.1; done
[[ -S "$SOCK" ]] || { echo "control.sock missing"; exit 1; }

call() {
  python3 - "$SOCK" "$@" <<'PY'
import json, socket, sys
sock, op = sys.argv[1], sys.argv[2]
source = sys.argv[3] if len(sys.argv) > 3 else None
s = socket.socket(socket.AF_UNIX)
s.settimeout(90)
s.connect(sock)
req = {"version": 1, "id": "smoke", "operation": op}
if source:
    req["source"] = source
s.sendall((json.dumps(req) + "\n").encode())
data = b""
while b"\n" not in data:
    data += s.recv(8192)
s.close()
print(data.decode().strip())
PY
}

echo "== status =="
call status
echo "== ensureDsh =="
ENSURE=$(call ensureDsh userStart)
echo "$ENSURE"
echo "$ENSURE" | python3 -c 'import json,sys; v=json.load(sys.stdin); assert v["ok"] and v["value"]["phase"]=="ready", v'
echo "== connectionInfo =="
INFO=$(call connectionInfo)
echo "$INFO"
URL=$(echo "$INFO" | python3 -c 'import json,sys; print(json.load(sys.stdin)["value"]["url"])')
echo "== /connect cookie =="
TOKEN=$(python3 -c 'from urllib.parse import urlparse,parse_qs; u=urlparse("'"$URL"'"); print(parse_qs(u.query)["token"][0])')
ORIGIN=$(python3 -c 'from urllib.parse import urlparse; u=urlparse("'"$URL"'"); print(f"{u.scheme}://{u.netloc}")')
HDR=$(mktemp)
curl -sS -D "$HDR" -o /dev/null \
  "${ORIGIN}/connect?token=${TOKEN}&interactions=answer"
head -1 "$HDR"
grep -q "302" "$HDR"
grep -qi "^set-cookie:" "$HDR"
rm -f "$HDR"
echo "== stopDsh =="
call stopDsh
echo "OK"
