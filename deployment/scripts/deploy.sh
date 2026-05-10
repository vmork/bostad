#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/bostad/app}"
CONFIG_FILE="${DEPLOYMENT_CONFIG_FILE:-$APP_DIR/deployment/config.env}"

export PATH="$HOME/.local/bin:$PATH"

if [[ -f "$CONFIG_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
  set +a
fi

APP_DIR="${APP_DIR:-/srv/bostad/app}"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"

exec 9>"${TMPDIR:-/tmp}/bostad-deploy.lock"
flock -n 9 || {
  echo "Another deploy is already running"
  exit 1
}

echo "==> Updating repo"
cd "$APP_DIR"
git fetch origin main
git checkout main
git pull --ff-only origin main

echo "==> Syncing backend"
cd "$BACKEND_DIR"
uv sync --frozen

echo "==> Building frontend"
cd "$FRONTEND_DIR"
pnpm install --frozen-lockfile
pnpm build

echo "==> Restarting backend"
sudo systemctl restart bostad-backend

echo "==> Health check"
curl -fsS http://127.0.0.1:8000/openapi.json >/dev/null

echo "==> Deploy complete"
