#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/bostad/app}"
CONFIG_FILE="${DEPLOYMENT_CONFIG_FILE:-$APP_DIR/deployment/config.env}"

if [[ -f "$CONFIG_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$CONFIG_FILE"
    set +a
fi

BACKEND_BASE_URL="${BACKEND_BASE_URL:-http://127.0.0.1:8000}"
CACHE_DIR="${BOSTAD_CACHE_DIR:-/srv/bostad/cache}"
LISTINGS_SOURCES_JSON="${LISTINGS_SOURCES_JSON:-[\"bostadsthlm\",\"homeq\"]}"

PAYLOAD_FILE="$CACHE_DIR/all_listings.json"
UPDATED_AT_FILE="$CACHE_DIR/all_listings.updated_at"
TMP_PAYLOAD_FILE="$(mktemp "$CACHE_DIR/all_listings.json.tmp.XXXXXX")"
TMP_UPDATED_AT_FILE="$(mktemp "$CACHE_DIR/all_listings.updated_at.tmp.XXXXXX")"

cleanup() {
  rm -f "$TMP_PAYLOAD_FILE" "$TMP_UPDATED_AT_FILE"
}
trap cleanup EXIT

mkdir -p "$CACHE_DIR"

REQUEST_BODY="$(python3 - <<'PY'
import json
import os
import sys

try:
    sources = json.loads(os.environ["LISTINGS_SOURCES_JSON"])
except (KeyError, json.JSONDecodeError) as error:
    raise SystemExit(f"Invalid LISTINGS_SOURCES_JSON: {error}") from error

payload = {"sources": sources}
cookie = os.environ.get("BOSTAD_COOKIE", "").strip()
if cookie:
    payload["bostadsthlm"] = {"cookie": cookie}

sys.stdout.write(json.dumps(payload))
PY
)"

echo "==> Refetching listings"
curl --fail --silent --show-error \
  -X POST "$BACKEND_BASE_URL/api/all_listings" \
  -H 'Content-Type: application/json' \
  --data "$REQUEST_BODY" \
  > "$TMP_PAYLOAD_FILE"

python3 - "$TMP_PAYLOAD_FILE" "$TMP_UPDATED_AT_FILE" <<'PY'
import datetime
import json
import sys

payload_path = sys.argv[1]
updated_at_path = sys.argv[2]

with open(payload_path) as payload_file:
    payload = json.load(payload_file)

updated_at = payload.get("updatedAt")
if not isinstance(updated_at, str) or not updated_at.strip():
    updated_at = datetime.datetime.now(datetime.UTC).isoformat()

with open(updated_at_path, "w") as updated_at_file:
    updated_at_file.write(updated_at.strip() + "\n")
PY

mv "$TMP_PAYLOAD_FILE" "$PAYLOAD_FILE"
mv "$TMP_UPDATED_AT_FILE" "$UPDATED_AT_FILE"

echo "==> Cached listings at $PAYLOAD_FILE"
echo "==> Cached updatedAt at $UPDATED_AT_FILE"
