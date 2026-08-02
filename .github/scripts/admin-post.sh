#!/usr/bin/env bash
# POSTs to an admin-token-protected internal endpoint, retrying transient
# upstream failures.
#
# The scheduled admin triggers used to call `curl -sf` inline. That swallowed
# the status code — a red run reported only "exit code 22", which is why both
# #1982 (Wolke Watch) and #2064 (NLP Enrichment) sat undiagnosed: nothing in the
# log distinguished a 403 (token) from a 500 (service) from a 504 (proxy). It
# also gave up on the first hiccup, so a single blip in production opened a
# tracking issue.
#
# Usage: admin-post.sh <endpoint-path> <out-file> [json-body]
#   Writes the response body to <out-file> and prints the final HTTP code as the
#   only stdout line; progress goes to stderr. Always exits 0 — callers branch
#   on the code (same contract as content-sync-request.sh).
# Env: ADMIN_API_URL, ADMIN_TOKEN
#      MAX_TIME    per-attempt curl budget in seconds (default 600)
#      ATTEMPTS    total tries including the first (default 3)
#      RETRY_DELAY first backoff step in seconds, doubles per retry (default 20)
set -uo pipefail

ENDPOINT=$1
OUT_FILE=$2
BODY=${3:-}

MAX_TIME=${MAX_TIME:-600}
ATTEMPTS=${ATTEMPTS:-3}
RETRY_DELAY=${RETRY_DELAY:-20}

if [ -z "${ADMIN_TOKEN:-}" ]; then
  jq -nc '{success: false, error: "ADMIN_TOKEN is empty or unset"}' > "$OUT_FILE"
  echo "::error::ADMIN_TOKEN repository secret is empty or unset." >&2
  echo "000"
  exit 0
fi

URL="${ADMIN_API_URL%/}$ENDPOINT"
DELAY=$RETRY_DELAY
HTTP_CODE=000

for ATTEMPT in $(seq 1 "$ATTEMPTS"); do
  echo "POST $URL (attempt $ATTEMPT/$ATTEMPTS)" >&2

  # Clear the body first: curl leaves the file untouched when it cannot connect,
  # which would otherwise pass the previous attempt's body off as this one's.
  : > "$OUT_FILE"

  if [ -n "$BODY" ]; then
    HTTP_CODE=$(curl -s -o "$OUT_FILE" -w '%{http_code}' -X POST "$URL" \
      -H "x-admin-token: $ADMIN_TOKEN" -H 'Content-Type: application/json' \
      -d "$BODY" --max-time "$MAX_TIME")
  else
    HTTP_CODE=$(curl -s -o "$OUT_FILE" -w '%{http_code}' -X POST "$URL" \
      -H "x-admin-token: $ADMIN_TOKEN" --max-time "$MAX_TIME")
  fi

  # curl already writes 000 for connection/timeout failures; appending our own
  # fallback would produce "000000" and silently defeat the retry match below.
  case "$HTTP_CODE" in '' | *[!0-9]*) HTTP_CODE=000 ;; esac

  echo "HTTP $HTTP_CODE" >&2

  case "$HTTP_CODE" in
    # 000 = connection refused / DNS / client-side timeout. 408, 429 and 5xx are
    # the upstream's own "try again" codes. Everything else (2xx, and 4xx like
    # the 403 a stale ADMIN_TOKEN earns) is final — retrying only hides it.
    000 | 408 | 429 | 5??) ;;
    *) break ;;
  esac

  if [ "$ATTEMPT" -lt "$ATTEMPTS" ]; then
    echo "Transient failure — retrying in ${DELAY}s" >&2
    sleep "$DELAY"
    DELAY=$((DELAY * 2))
  fi
done

# A retried-out attempt may have left a proxy error page in place of JSON; keep
# the body but make sure the caller's jq has something valid to read.
if ! jq -e . "$OUT_FILE" >/dev/null 2>&1; then
  RAW=$(head -c 300 "$OUT_FILE" 2>/dev/null || echo '')
  jq -nc --arg code "$HTTP_CODE" --arg raw "$RAW" \
    '{success: false, error: "Non-JSON response (HTTP \($code))", body: $raw}' > "$OUT_FILE"
fi

echo "$HTTP_CODE"
