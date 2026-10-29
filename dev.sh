#!/usr/bin/env bash
# Run a command inside Node 22 (the host has Node 18, too old for Vite 7).
# Usage: ./dev.sh npm install   |   ./dev.sh npx vitest run
set -euo pipefail
cd "$(dirname "$0")"
docker run --rm -i -u "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
  ${DEV_PORTS:-} -v "$PWD":/app -w /app node:22-alpine "$@"
