#!/usr/bin/env bash
# Wave Browser CLI — start server, open wave files, and more.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_DIR="$REPO_ROOT/.wave-browser"
PID_FILE="$RUN_DIR/server.pid"
LOG_FILE="$RUN_DIR/server.log"
PORT="${WAVE_BROWSER_PORT:-8000}"
HOST="${WAVE_BROWSER_HOST:-0.0.0.0}"
HEALTH_URL="http://127.0.0.1:${PORT}/health"

usage() {
  cat <<EOF
Usage: $(basename "$0") <command> [options]

Commands:
  build                 Build the frontend production bundle
  start                 Start the Wave Browser server (UI + API on port ${PORT})
  stop                  Stop the background server
  status                Check whether the server is running
  open-wave <fsdb>      Open an FSDB file in the browser (starts server if needed)
                        Options: --design-db <path>  optional KDB/RTL path
  demo                  Start frontend dev server (demo mode, no backend)

Examples:
  $(basename "$0") start
  $(basename "$0") open-wave /path/to/waves.fsdb
  $(basename "$0") open-wave /path/to/waves.fsdb --design-db /path/to/design.kdb

Environment:
  WAVE_BROWSER_PORT     Server port (default: 8000)
  WAVE_BROWSER_HOST     Bind address (default: 0.0.0.0)
EOF
}

load_modules() {
  if [[ -f /global/etc/modules/3.1.6/init/bash ]]; then
    # shellcheck disable=SC1091
    source /global/etc/modules/3.1.6/init/bash
    module load python/3.11 2>/dev/null || true
    module load node/18.19.1 2>/dev/null || true
  fi
}

ensure_dist() {
  if [[ ! -f "$REPO_ROOT/frontend/dist/index.html" ]]; then
    echo "Frontend not built. Run: $0 build" >&2
    exit 1
  fi
}

cmd_build() {
  load_modules
  cd "$REPO_ROOT/frontend"
  npm run build
  echo "Frontend built: $REPO_ROOT/frontend/dist"
}

is_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    rm -f "$PID_FILE"
  fi
  curl -sf "$HEALTH_URL" >/dev/null 2>&1
}

cmd_status() {
  if is_running; then
    echo "Wave Browser is running on port ${PORT}"
    echo "  UI:    http://localhost:${PORT}/"
    echo "  API:   http://localhost:${PORT}/docs"
    if [[ -f "$PID_FILE" ]]; then
      echo "  PID:   $(cat "$PID_FILE")"
    fi
    return 0
  fi
  echo "Wave Browser is not running"
  return 1
}

cmd_start() {
  ensure_dist

  if is_running; then
    echo "Wave Browser already running on port ${PORT}"
    cmd_status
    return 0
  fi

  mkdir -p "$RUN_DIR"

  # shellcheck disable=SC1091
  source "$REPO_ROOT/setup_env.sh" >/dev/null 2>&1 || true
  load_modules

  cd "$REPO_ROOT/backend"
  # shellcheck disable=SC1091
  source .venv/bin/activate

  echo "Starting Wave Browser on ${HOST}:${PORT}..."
  nohup python -m uvicorn app.main:app \
    --host "$HOST" \
    --port "$PORT" \
    >>"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"

  for _ in $(seq 1 30); do
    if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
      echo "Wave Browser started"
      echo "  Open: http://localhost:${PORT}/"
      echo "  Log:  $LOG_FILE"
      return 0
    fi
    sleep 0.5
  done

  echo "Server failed to start. Check log: $LOG_FILE" >&2
  tail -20 "$LOG_FILE" >&2 || true
  exit 1
}

cmd_stop() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid"
      echo "Stopped Wave Browser (PID $pid)"
    fi
    rm -f "$PID_FILE"
    return 0
  fi
  echo "No PID file found — server may not be running"
}

url_encode() {
  python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$1"
}

cmd_demo() {
  load_modules
  cd "$REPO_ROOT/frontend"
  if [[ ! -d node_modules ]]; then
    npm install
  fi
  echo "Starting demo mode (no backend required) at http://localhost:5173/"
  exec npm run dev -- --host 0.0.0.0
}

cmd_open_wave() {
  local wave_path=""
  local design_path=""

  if [[ $# -lt 1 ]]; then
    echo "Usage: $0 open-wave <fsdb-path> [--design-db <path>]" >&2
    exit 1
  fi

  wave_path="$1"
  shift

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --design-db)
        design_path="${2:-}"
        shift 2
        ;;
      *)
        echo "Unknown option: $1" >&2
        exit 1
        ;;
    esac
  done

  if [[ ! -f "$wave_path" ]]; then
    echo "FSDB file not found: $wave_path" >&2
    exit 1
  fi

  wave_path="$(cd "$(dirname "$wave_path")" && pwd)/$(basename "$wave_path")"

  if ! is_running; then
    cmd_start
  fi

  local url="http://localhost:${PORT}/?server=127.0.0.1:${PORT}&fsdb=$(url_encode "$wave_path")"
  if [[ -n "$design_path" ]]; then
    url="${url}&design_db=$(url_encode "$design_path")"
  fi

  echo "$url"
  echo ""
  echo "Open the URL above in your browser."
  echo "With VS Code Remote SSH, use the forwarded port in the Ports panel or Simple Browser."
}

main() {
  local cmd="${1:-}"
  shift || true

  case "$cmd" in
    build) cmd_build "$@" ;;
    start) cmd_start "$@" ;;
    stop) cmd_stop "$@" ;;
    status) cmd_status "$@" ;;
    open-wave) cmd_open_wave "$@" ;;
    demo) cmd_demo "$@" ;;
    -h|--help|help|"") usage ;;
    *)
      echo "Unknown command: $cmd" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
