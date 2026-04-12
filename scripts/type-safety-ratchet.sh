#!/bin/bash
# Type Safety Ratchet — CI script that fails if unsafe patterns increase.
#
# Counts `as unknown as` casts and `eslint-disable no-explicit-any` suppressions.
# If the count exceeds the threshold, the build fails. Thresholds only go down.
#
# Usage: ./scripts/type-safety-ratchet.sh
# Add to CI: runs after lint, catches regressions that lint rules miss.

set -euo pipefail

# --- Thresholds (update these when counts decrease) ---
# Last updated: 2026-04-12
# ts-rest router wiring (Phase 4.1 expansion) added ~23 `as unknown as AuthenticatedRequest`
# casts. These are concentrated in contract routers and will be removed when we augment
# Express.Request with our custom auth fields (see roadmap "Known debt" section).
MAX_CASTS_API=110
MAX_CASTS_TOTAL=185
MAX_SUPPRESSIONS_API=75
MAX_SUPPRESSIONS_TOTAL=85

# Source directories to scan (excludes docs/, inspiration/, etc.)
SOURCE_DIRS="apps/ packages/ services/"

# --- Count functions ---
EXCLUDE="--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude-dir=.turbo --exclude-dir=.next --exclude-dir=coverage --exclude-dir=.expo"

count_casts() {
  local dir="${1:-.}"
  grep -r $EXCLUDE "as unknown as" "$dir" \
    --include="*.ts" --include="*.tsx" \
    2>/dev/null | wc -l
}

count_suppressions() {
  local dir="${1:-.}"
  grep -r $EXCLUDE "eslint-disable.*no-explicit-any" "$dir" \
    --include="*.ts" --include="*.tsx" \
    2>/dev/null | wc -l
}

# --- Run checks ---
echo "🔒 Type Safety Ratchet"
echo "======================"

FAIL=0

CASTS_API=$(count_casts "apps/api")
CASTS_TOTAL=$(count_casts $SOURCE_DIRS)
SUPPR_API=$(count_suppressions "apps/api")
SUPPR_TOTAL=$(count_suppressions $SOURCE_DIRS)

echo ""
echo "as-unknown-as casts:"
echo "  api:   $CASTS_API (max: $MAX_CASTS_API)"
echo "  total: $CASTS_TOTAL (max: $MAX_CASTS_TOTAL)"

echo ""
echo "eslint-disable no-explicit-any:"
echo "  api:   $SUPPR_API (max: $MAX_SUPPRESSIONS_API)"
echo "  total: $SUPPR_TOTAL (max: $MAX_SUPPRESSIONS_TOTAL)"

if [ "$CASTS_API" -gt "$MAX_CASTS_API" ]; then
  echo ""; echo "FAIL: as-unknown-as casts in api ($CASTS_API) exceeds threshold ($MAX_CASTS_API)"
  FAIL=1
fi

if [ "$CASTS_TOTAL" -gt "$MAX_CASTS_TOTAL" ]; then
  echo ""; echo "FAIL: as-unknown-as casts total ($CASTS_TOTAL) exceeds threshold ($MAX_CASTS_TOTAL)"
  FAIL=1
fi

if [ "$SUPPR_API" -gt "$MAX_SUPPRESSIONS_API" ]; then
  echo ""; echo "FAIL: eslint-disable suppressions in api ($SUPPR_API) exceeds threshold ($MAX_SUPPRESSIONS_API)"
  FAIL=1
fi

if [ "$SUPPR_TOTAL" -gt "$MAX_SUPPRESSIONS_TOTAL" ]; then
  echo ""; echo "FAIL: eslint-disable suppressions total ($SUPPR_TOTAL) exceeds threshold ($MAX_SUPPRESSIONS_TOTAL)"
  FAIL=1
fi

if [ "$FAIL" -eq 0 ]; then
  echo ""
  echo "All counts within thresholds."
  # Hint: if counts decreased, update thresholds in this script to ratchet down
  if [ "$CASTS_API" -lt "$MAX_CASTS_API" ] || [ "$CASTS_TOTAL" -lt "$MAX_CASTS_TOTAL" ] || \
     [ "$SUPPR_API" -lt "$MAX_SUPPRESSIONS_API" ] || [ "$SUPPR_TOTAL" -lt "$MAX_SUPPRESSIONS_TOTAL" ]; then
    echo "TIP: Some counts are below thresholds — consider lowering them to ratchet down."
  fi
fi

exit $FAIL
