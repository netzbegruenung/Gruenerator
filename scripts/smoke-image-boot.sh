#!/usr/bin/env bash
# Startet ein Image einmal ohne Postgres/Redis und bricht ab, wenn Node beim
# Laden ein Modul nicht auflösen kann. Der Exit-Code des Containers zählt
# nicht — ohne Dienste darf er danach ruhig scheitern; ESM löst aber alle
# statischen Importe auf, bevor die erste Zeile läuft, ein fehlendes dist
# fällt also vorher auf. Hintergrund: scripts/check-image-runtime-deps.mjs.
set -euo pipefail

image="$1"
wait_seconds="${2:-20}"
# Optional extra `docker run` arguments, e.g. SMOKE_DOCKER_ARGS="-e SITES_HOST=sites.ci.test".
read -r -a extra_args <<<"${SMOKE_DOCKER_ARGS:-}"

cid=$(docker run -d ${extra_args[@]+"${extra_args[@]}"} "$image")
sleep "$wait_seconds"
logs=$(docker logs "$cid" 2>&1 || true)
docker rm -f "$cid" >/dev/null

echo "$logs" | tail -n 40

if grep -qE 'ERR_MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED|does not provide an export named|Cannot find (module|package)|site assets missing' <<<"$logs"; then
  echo "::error::$image kann ein Modul nicht laden (siehe Log oben)"
  exit 1
fi
echo "$image: Module geladen."
