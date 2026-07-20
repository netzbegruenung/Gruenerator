#!/usr/bin/env bash
# Triggers a content sync as a background job and polls until it finishes.
#
# The sync endpoint used to run synchronously, but full runs (LV BE/HE
# nightly) outlive the reverse proxy's ~5 min timeout — the proxy returned
# 504 while the sync kept running server-side. `background: true` gets a
# 202 + jobId back immediately; the job result is polled from Redis-backed
# GET /jobs/:jobId.
#
# Usage: content-sync-request.sh <source-path> <body-json> <out-file>
#   Writes the final sync result JSON to <out-file> and prints the effective
#   HTTP code (200 on success, the failure code otherwise) as the only stdout
#   line; progress goes to stderr. Always exits 0 — callers branch on the code.
# Env: CONTENT_SYNC_API_URL, ADMIN_TOKEN
#      POLL_TIMEOUT_SECONDS (default 3300)
set -uo pipefail

SOURCE_PATH=$1
BODY=$2
OUT_FILE=$3
TIMEOUT=${POLL_TIMEOUT_SECONDS:-3300}

finish_failed() { # <message> <http-code>
  jq -nc --arg err "$1" '{success: false, error: $err}' > "$OUT_FILE"
  echo "$2"
  exit 0
}

BODY=$(echo "$BODY" | jq -c '. + {background: true}')

echo "POST $CONTENT_SYNC_API_URL/api/internal/content-sync/source/$SOURCE_PATH ($BODY)" >&2
RESPONSE=$(curl -s -w '\n%{http_code}' -X POST \
  "$CONTENT_SYNC_API_URL/api/internal/content-sync/source/$SOURCE_PATH" \
  -H "x-admin-token: $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "$BODY" --max-time "$TIMEOUT")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "202" ]; then
  # 409 busy, 5xx — or a backend without background support, which ignores the
  # flag and answers 200 with the full synchronous result. Pass both through.
  echo "$RESPONSE_BODY" > "$OUT_FILE"
  echo "$HTTP_CODE"
  exit 0
fi

JOB_ID=$(echo "$RESPONSE_BODY" | jq -r '.jobId // empty' 2>/dev/null)
if [ -z "$JOB_ID" ]; then
  finish_failed "202 response carried no jobId: $(echo "$RESPONSE_BODY" | head -c 300)" 500
fi
JOB_URL="$CONTENT_SYNC_API_URL/api/internal/content-sync/jobs/$JOB_ID"
echo "Sync accepted as job $JOB_ID — polling (timeout ${TIMEOUT}s)" >&2

DEADLINE=$((SECONDS + TIMEOUT))
INTERVAL=5
MISSES=0
while [ "$SECONDS" -lt "$DEADLINE" ]; do
  POLL=$(curl -s -w '\n%{http_code}' --max-time 60 \
    -H "x-admin-token: $ADMIN_TOKEN" "$JOB_URL" || printf '\n000')
  POLL_CODE=$(echo "$POLL" | tail -n1)
  POLL_BODY=$(echo "$POLL" | sed '$d')
  STATUS=$(echo "$POLL_BODY" | jq -r '.status // empty' 2>/dev/null)

  # Tolerate transient poll failures (proxy hiccup, rolling deploy, non-JSON
  # error page) — but persistent ones mean the job record is gone, so give up.
  if [ "$POLL_CODE" != "200" ] || [ -z "$STATUS" ]; then
    MISSES=$((MISSES + 1))
    echo "Poll failed with HTTP $POLL_CODE ($MISSES/5)" >&2
    if [ "$MISSES" -ge 5 ]; then
      finish_failed "Job polling failed with HTTP $POLL_CODE" "$POLL_CODE"
    fi
  elif [ "$STATUS" = "running" ]; then
    MISSES=0
    echo "Job $JOB_ID still running (${SECONDS}s elapsed)" >&2
  else
    echo "$POLL_BODY" | jq '.result // {}' > "$OUT_FILE"
    if [ "$STATUS" = "completed" ]; then echo "200"; else echo "500"; fi
    exit 0
  fi

  # Fast hourly recent runs finish in well under a minute — start polling
  # tightly, back off to 30s for the long nightly walks.
  sleep "$INTERVAL"
  INTERVAL=$((INTERVAL * 2))
  if [ "$INTERVAL" -gt 30 ]; then INTERVAL=30; fi
done

finish_failed "Timed out after ${TIMEOUT}s waiting for job $JOB_ID" 504
