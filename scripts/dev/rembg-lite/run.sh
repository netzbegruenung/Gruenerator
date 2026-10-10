#!/usr/bin/env bash
# Starts the rembg-lite dev server in a cached venv (.cache/rembg-lite-venv).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../../.." && pwd)"
VENV="$ROOT/.cache/rembg-lite-venv"

if ! command -v python3 >/dev/null 2>&1; then
  echo "rembg-lite: python3 not found. Install Python 3 (e.g. 'brew install python') and retry." >&2
  exit 1
fi

[ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"

STAMP="$VENV/.requirements.sha"
HASH="$(shasum "$DIR/requirements.txt" | cut -d' ' -f1)"
if [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$HASH" ]; then
  echo "rembg-lite: installing requirements (first run downloads onnxruntime, ~100 MB)..."
  "$VENV/bin/pip" install --quiet -r "$DIR/requirements.txt"
  echo "$HASH" > "$STAMP"
fi

echo "rembg-lite: listening on http://127.0.0.1:${REMBG_LITE_PORT:-7070} (model ${REMBG_LITE_MODEL:-u2netp})"
exec "$VENV/bin/python" "$DIR/server.py"
