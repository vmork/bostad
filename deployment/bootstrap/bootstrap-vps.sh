#!/usr/bin/env bash
set -euo pipefail

APP_USER="${APP_USER:-bostad}"
APP_GROUP="${APP_GROUP:-$APP_USER}"
APP_ROOT="${APP_ROOT:-/srv/bostad}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

echo "==> Installing base packages"
apt update
apt install -y git curl build-essential ca-certificates unzip libgeos-dev ufw

echo "==> Adding firewall rules"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp

if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node.js"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "==> Installing pnpm"
  npm install -g pnpm
fi

if ! command -v caddy >/dev/null 2>&1; then
  echo "==> Installing Caddy if available via apt"
  if ! apt install -y caddy; then
    echo "Caddy install via apt failed. Install Caddy separately, then rerun the config apply step." >&2
  fi
fi

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  echo "==> Creating app user $APP_USER"
  adduser --disabled-password --gecos "" "$APP_USER"
fi

echo "==> Creating app directories"
mkdir -p "$APP_ROOT" "$APP_ROOT/bin" "$APP_ROOT/cache"
chown -R "$APP_USER:$APP_GROUP" "$APP_ROOT"

echo "==> Installing uv for $APP_USER"
sudo -u "$APP_USER" -H bash -lc 'curl -LsSf https://astral.sh/uv/install.sh | sh'

echo "==> Bootstrap complete"
echo "Next steps: clone the repo to $APP_ROOT/app, then run deployment/scripts/install-config.sh"
