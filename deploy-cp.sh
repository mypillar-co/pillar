#!/bin/bash
# deploy-cp.sh — Build, verify, and signal restart for the Community Platform.
#
# This script protects production from broken CP builds. It refuses to advance
# unless the built index.html contains the expected `/sites/placeholder/assets/`
# base path — the marker that confirms vite.config.ts and the path-rewrite
# middleware are still aligned.
#
# Never edit artifacts/community-platform/vite.config.ts or server/index.ts
# without running this script afterward.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
CP_DIR="$ROOT_DIR/artifacts/community-platform"
INDEX_FILE="$CP_DIR/dist/public/index.html"
EXPECTED_MARKER="/sites/placeholder/assets/"

echo "[deploy-cp] Building community platform..."
pnpm --filter @workspace/community-platform run build

echo "[deploy-cp] Verifying build output..."
if [[ ! -f "$INDEX_FILE" ]]; then
  echo "[deploy-cp] ERROR: $INDEX_FILE not found after build."
  echo "[deploy-cp] Refusing to restart. The previous build is still running."
  exit 1
fi

if ! grep -q "$EXPECTED_MARKER" "$INDEX_FILE"; then
  echo "[deploy-cp] ERROR: Build verification failed — '$EXPECTED_MARKER' not found in index.html"
  echo "[deploy-cp] This usually means vite.config.ts lost its 'base' setting."
  echo "[deploy-cp] Refusing to restart. The previous build is still running."
  exit 1
fi

echo "[deploy-cp] ✓ Build verified — '$EXPECTED_MARKER' present in index.html"

# Restart strategy:
#   - In dev (Replit workspace): use the workflow tool to restart
#       "artifacts/community-platform: web"
#   - In production (Replit Deployments): the deployment runner restarts the
#       service automatically after a successful build.
# We do NOT pkill the dev process here — Replit's workflow runner won't respawn
# it, which would silently take the CP offline.
echo "[deploy-cp] Build complete. Restart the CP workflow to pick up changes:"
echo "[deploy-cp]   workflow: artifacts/community-platform: web"
