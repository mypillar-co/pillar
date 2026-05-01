#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  echo "Missing ${ROOT_DIR}/.env" >&2
  exit 1
fi

set -a
source "${ROOT_DIR}/.env"
set +a

export NODE_ENV=development
export DISABLE_SCHEDULER=1
export PILLAR_SERVICE_KEY="${PILLAR_SERVICE_KEY:-dev-service-key}"
export DEV_LOGIN_EMAIL="${DEV_LOGIN_EMAIL:-andrewpaluch01@gmail.com}"

LOG_DIR="${ROOT_DIR}/.logs/dev-local"
mkdir -p "${LOG_DIR}"

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "${pids}" | xargs kill -9 2>/dev/null || true
  fi
}

wait_for_http() {
  local url="$1"
  local name="$2"
  local attempts="${3:-60}"
  local delay="${4:-0.5}"
  local code=""
  for _ in $(seq 1 "${attempts}"); do
    code="$(curl -s -o /dev/null -w "%{http_code}" "${url}" || true)"
    if [[ "${code}" =~ ^(200|302|401|403)$ ]]; then
      echo "${name}: ${code} ${url}"
      return 0
    fi
    sleep "${delay}"
  done
  echo "${name}: failed ${url}" >&2
  return 1
}

spawn_detached() {
  local workdir="$1"
  local logfile="$2"
  shift 2
  node -e '
    const { spawn } = require("child_process");
    const fs = require("fs");
    const [cwd, logPath, ...cmd] = process.argv.slice(1);
    const out = fs.openSync(logPath, "a");
    const child = spawn(cmd[0], cmd.slice(1), {
      cwd,
      env: process.env,
      detached: true,
      stdio: ["ignore", out, out],
    });
    child.unref();
  ' "$workdir" "$logfile" "$@"
}

echo "Stopping existing local services..."
kill_port 8080
kill_port 5173
kill_port 5001
sleep 0.4

echo "Starting API on 8080..."
pnpm --filter @workspace/api-server run build >"${LOG_DIR}/api-build.log" 2>&1
export PORT=8080
spawn_detached \
  "${ROOT_DIR}/artifacts/api-server" \
  "${LOG_DIR}/api.log" \
  node "--env-file=${ROOT_DIR}/.env" --enable-source-maps ./dist/index.mjs

echo "Starting community-platform on 5001..."
export PORT=5001
spawn_detached \
  "${ROOT_DIR}" \
  "${LOG_DIR}/community-platform.log" \
  pnpm --filter @workspace/community-platform run dev

echo "Starting Steward on 5173..."
export PORT=5173
spawn_detached \
  "${ROOT_DIR}" \
  "${LOG_DIR}/steward.log" \
  pnpm --filter @workspace/steward run dev -- --port 5173

wait_for_http "http://127.0.0.1:8080/api/healthz" "API health"
wait_for_http "http://127.0.0.1:5001/" "Community-platform health"
wait_for_http "http://127.0.0.1:5173/dashboard/site" "Steward health"

DEV_LOGIN_URL="http://127.0.0.1:8080/api/auth/dev-login?email=${DEV_LOGIN_EMAIL}"
DASHBOARD_URL="http://127.0.0.1:5173/dashboard/site"

echo "Opening dev login: ${DEV_LOGIN_URL}"
echo "Opening dashboard: ${DASHBOARD_URL}"
if command -v open >/dev/null 2>&1; then
  open "${DEV_LOGIN_URL}" || true
  sleep 0.5
  open "${DASHBOARD_URL}" || true
fi

echo
echo "Logs:"
echo "  API: ${LOG_DIR}/api.log"
echo "  Community platform: ${LOG_DIR}/community-platform.log"
echo "  Steward: ${LOG_DIR}/steward.log"
