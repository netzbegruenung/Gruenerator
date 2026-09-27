#!/usr/bin/env bash
# Reads a GitHub Actions job log on stdin and prints one line per failed test,
# deduplicated — the key `test-failure-issues.yml` files issues under.
#
#   vitest:  " FAIL  routes/x.vitest.ts > suite > case"  (optional " node "/" dom " project label)
#   jest:    " FAIL  __tests__/x.test.tsx (5.2 s)"         (file only — jest names cases elsewhere)
#   pytest:  "FAILED tests/test_x.py::test_y - AssertionError"
set -euo pipefail

sed -E 's/\x1b\[[0-9;]*m//g; s/^[0-9TZ:.-]+ //' |
  {
    grep -E '(^|[[:space:]])FAIL(ED)?[[:space:]]' || true
  } |
  sed -nE \
    -e 's/.*FAIL[[:space:]]+((node|dom|jsdom)[[:space:]]+)?([^[:space:]]+\.(vitest|test|spec)\.[cm]?[jt]sx?.*)$/\3/p' \
    -e 's/.*FAILED[[:space:]]+([^[:space:]]+\.py::[^[:space:]]+).*/\1/p' |
  sed -E 's/[[:space:]]+\([0-9.]+ ?m?s\)$//; s/[[:space:]]+\[[^]]*\]$//; s/[[:space:]]+$//' |
  awk '!seen[$0]++'
