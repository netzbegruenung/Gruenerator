#!/bin/bash
# Type Safety Ratchet — CI script that fails if unsafe patterns increase.
#
# Counts `as unknown as` casts across production TypeScript sources.
# The threshold is read from .type-safety-baseline (a single integer at repo root).
# If the count exceeds the threshold, the build fails. The threshold only goes down.
#
# Usage: ./scripts/type-safety-ratchet.sh
# Add to CI: runs after lint, catches regressions that lint rules miss.
#
# To lower the baseline after reducing casts:
#   echo <new-count> > .type-safety-baseline

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE_FILE="$REPO_ROOT/.type-safety-baseline"

if [[ ! -f "$BASELINE_FILE" ]]; then
  echo "ERROR: $BASELINE_FILE not found." >&2
  echo "       Create it with: echo <count> > .type-safety-baseline" >&2
  exit 1
fi

THRESHOLD=$(tr -d '[:space:]' < "$BASELINE_FILE")

if ! [[ "$THRESHOLD" =~ ^[0-9]+$ ]]; then
  echo "ERROR: .type-safety-baseline must contain a single non-negative integer (got: '$THRESHOLD')" >&2
  exit 1
fi

# Source directories to scan
SOURCE_DIRS="apps/ packages/ services/"

# Patterns excluded from the count
EXCLUDE="--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude-dir=.turbo --exclude-dir=.next --exclude-dir=coverage --exclude-dir=.expo"

cd "$REPO_ROOT"

COUNT=$(grep -r $EXCLUDE "as unknown as" $SOURCE_DIRS \
  --include="*.ts" --include="*.tsx" \
  2>/dev/null \
  | grep -v "\.test\." \
  | grep -v "\.vitest\." \
  | wc -l)
COUNT="${COUNT// /}"

echo "Type Safety Ratchet"
echo "==================="
echo ""
echo "as unknown as cast count : $COUNT"
echo "Baseline threshold       : $THRESHOLD"

if (( COUNT > THRESHOLD )); then
  echo ""
  echo "FAIL: Cast count ($COUNT) exceeds baseline ($THRESHOLD)." >&2
  echo "      Fix the new casts before merging, or update .type-safety-baseline" >&2
  echo "      only if the increase is intentional and reviewed." >&2
  exit 1
elif (( COUNT < THRESHOLD )); then
  echo ""
  echo "New floor reached! Cast count is $COUNT (was $THRESHOLD)."
  echo "Lower the baseline: echo $COUNT > .type-safety-baseline"
  exit 0
else
  echo ""
  echo "All counts within threshold."
  exit 0
fi
