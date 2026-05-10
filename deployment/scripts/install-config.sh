#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
CONFIG_FILE="$REPO_ROOT/deployment/config.env"

APP_USER="${APP_USER:-bostad}"
APP_GROUP="${APP_GROUP:-$APP_USER}"
APP_DIR="${APP_DIR:-/srv/bostad/app}"
BIN_DIR="${BIN_DIR:-/srv/bostad/bin}"
CACHE_DIR="${CACHE_DIR:-/srv/bostad/cache}"
DOMAIN="${DOMAIN:-}"

if [[ -f "$CONFIG_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
  set +a
fi

APP_USER="${APP_USER:-bostad}"
APP_GROUP="${APP_GROUP:-$APP_USER}"
APP_DIR="${APP_DIR:-/srv/bostad/app}"
BIN_DIR="${BIN_DIR:-/srv/bostad/bin}"
CACHE_DIR="${CACHE_DIR:-/srv/bostad/cache}"
DOMAIN="${DOMAIN:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

if [[ -z "$DOMAIN" ]]; then
  echo "Set DOMAIN in deployment/config.env or the shell environment before running this script." >&2
  exit 1
fi

render_template() {
  local source_path="$1"
  local destination_path="$2"
  sed \
    -e "s|__DOMAIN__|$DOMAIN|g" \
    -e "s|__APP_USER__|$APP_USER|g" \
    -e "s|__APP_GROUP__|$APP_GROUP|g" \
    -e "s|__APP_DIR__|$APP_DIR|g" \
    -e "s|__BIN_DIR__|$BIN_DIR|g" \
    -e "s|__CACHE_DIR__|$CACHE_DIR|g" \
    "$source_path" > "$destination_path"
}

echo "==> Creating server directories"
mkdir -p "$BIN_DIR" "$CACHE_DIR"
chown -R "$APP_USER:$APP_GROUP" "$BIN_DIR" "$CACHE_DIR"

echo "==> Installing deploy scripts"
install -m 755 "$REPO_ROOT/deployment/scripts/deploy.sh" "$BIN_DIR/deploy.sh"
install -m 755 "$REPO_ROOT/deployment/scripts/refetch-listings.sh" "$BIN_DIR/refetch-listings.sh"

echo "==> Installing systemd units"
render_template \
  "$REPO_ROOT/deployment/systemd/bostad-backend.service" \
  "/etc/systemd/system/bostad-backend.service"
render_template \
  "$REPO_ROOT/deployment/systemd/bostad-refetch.service" \
  "/etc/systemd/system/bostad-refetch.service"
install -m 644 \
  "$REPO_ROOT/deployment/systemd/bostad-refetch.timer" \
  "/etc/systemd/system/bostad-refetch.timer"

echo "==> Installing sudoers fragment"
local_sudoers="$(mktemp)"
render_template "$REPO_ROOT/deployment/sudoers/bostad-deploy" "$local_sudoers"
install -m 440 "$local_sudoers" "/etc/sudoers.d/bostad-deploy"
rm -f "$local_sudoers"

echo "==> Rendering Caddyfile"
local_caddyfile="$(mktemp)"
render_template "$REPO_ROOT/deployment/caddy/Caddyfile.template" "$local_caddyfile"
install -m 644 "$local_caddyfile" "/etc/caddy/Caddyfile"
rm -f "$local_caddyfile"

echo "==> Reloading service definitions"
systemctl daemon-reload
systemctl enable bostad-backend.service
systemctl enable bostad-refetch.timer

if command -v caddy >/dev/null 2>&1; then
  caddy fmt --overwrite /etc/caddy/Caddyfile
  caddy validate --config /etc/caddy/Caddyfile
  systemctl reload caddy
fi

if [[ -x "$APP_DIR/backend/.venv/bin/uvicorn" ]]; then
  systemctl restart bostad-backend.service
fi

systemctl start bostad-refetch.timer

echo "==> Config apply complete"
