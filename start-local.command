#!/bin/bash
cd "$(dirname "$0")"

echo "Loading env..."
set -a
source .env
set +a

echo "Starting API server..."
osascript -e 'tell application "Terminal" to do script "cd \"'"$PWD"'\" && set -a; source .env; set +a; pnpm --filter @workspace/api-server dev"'

sleep 3

echo "Starting Steward frontend..."
osascript -e 'tell application "Terminal" to do script "cd \"'"$PWD"'\" && pnpm --filter @workspace/steward dev"'

sleep 4

open http://localhost:8080/api/auth/dev-login?email=andrewpaluch01@gmail.com
sleep 2
open http://localhost:5173/dashboard/site