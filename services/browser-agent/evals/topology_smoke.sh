#!/usr/bin/env bash
# Prüft die Betriebs-Topologie: Browser-Agent nur in einem Docker-Netz ohne
# Ausgang (`internal: true`), der Egress-Proxy als eigener Container zwischen
# diesem Netz und dem Internet. Bindend ist hier das Netz, nicht der Proxy im
# Prozess: ein Renderer-Exploit im Chromium ohne Sandbox soll nur über den
# Proxy hinauskommen.
#
#   services/browser-agent/evals/topology_smoke.sh gruenerator-browser-agent:pr
#
# Jeder „gesperrt“-Fall hat eine Gegenprobe, die zeigt, dass das Ziel
# erreichbar ist, wo die Sperre nicht gilt. Braucht Internet (example.com).
set -euo pipefail

IMAGE=${1:?Image angeben}
P=bat-$$
INTERNAL=$P-internal
EGRESS_NET=$P-egress
HOST_PORT=18765
fails=0

cleanup() {
  docker rm -f "$P-egress" "$P-host" >/dev/null 2>&1 || true
  docker network rm "$INTERNAL" "$EGRESS_NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

report() { # ok name detail
  if [ "$1" = 1 ]; then echo "PASS $2"; else echo "FAIL $2 ($3)"; fails=$((fails + 1)); fi
}

# Python-Probe im Agent-Container (nur internes Netz). Exit 0 = Verbindung kam zustande.
in_agent() {
  docker run --rm --network "$INTERNAL" -e BROWSER_EGRESS_PROXY="http://$P-egress:8899" "$IMAGE" "$@"
}
tcp_probe() { # host port
  in_agent python -c "
import socket, sys
try:
    socket.create_connection(('$1', $2), timeout=5).close()
except OSError:
    sys.exit(1)
"
}

# Wie in Salt: ohne Gateway-Adresse. Ein bloßes `internal: true` lässt den Host
# über die Gateway-IP erreichbar (gemessen 27.10.2026, Docker 29.5) — Fall 3.
docker network create --internal \
  -o com.docker.network.bridge.gateway_mode_ipv4=isolated \
  -o com.docker.network.bridge.gateway_mode_ipv6=isolated \
  "$INTERNAL" >/dev/null
docker network create "$EGRESS_NET" >/dev/null
docker run -d --name "$P-egress" --network "$EGRESS_NET" "$IMAGE" \
  python -c "from browser_agent.egress import main; main()" >/dev/null
docker network connect "$INTERNAL" "$P-egress"
# Ein Dienst auf dem Host (wie Postgres auf host.docker.internal): Ziel für die Gateway-Probe.
docker run -d --name "$P-host" --network host "$IMAGE" python -m http.server "$HOST_PORT" --bind 0.0.0.0 >/dev/null

for _ in $(seq 1 30); do
  tcp_probe "$P-egress" 8899 && break
  sleep 1
done

# 1. Direkt ins Internet: gesperrt; über den Proxy-Container: geht.
if in_agent python -c "import httpx; httpx.get('https://example.com', timeout=8)" >/dev/null 2>&1; then
  report 0 "agent cannot reach the internet directly" "direct https://example.com loaded"
else
  report 1 "agent cannot reach the internet directly" ""
fi
if in_agent python -c "import httpx; httpx.get('https://example.com', timeout=15, proxy='http://$P-egress:8899').raise_for_status()" >/dev/null 2>&1; then
  report 1 "agent reaches the internet through the egress container" ""
else
  report 0 "agent reaches the internet through the egress container" "proxied https://example.com failed"
fi

# 2. Chromium mit dem Profil aus run.py (Proxy aus der Env) lädt über den Proxy-Container.
title=$(in_agent python -c "
import asyncio, tempfile
from pathlib import Path
from browser_use import BrowserSession
from browser_agent.run import build_profile

async def main():
    s = BrowserSession(browser_profile=build_profile(Path(tempfile.mkdtemp())))
    await s.start()
    await s.navigate_to('https://example.com')
    title = ''
    for _ in range(20):
        await asyncio.sleep(0.5)
        cdp = await s.get_or_create_cdp_session()
        r = await cdp.cdp_client.send.Runtime.evaluate(params={'expression': 'document.title', 'returnByValue': True}, session_id=cdp.session_id)
        title = r['result'].get('value', '')
        if title == 'Example Domain':
            break
    print('TITLE=' + title)
    await s.kill()

asyncio.run(main())
" 2>/dev/null | grep '^TITLE=' || true)
if [ "$title" = "TITLE=Example Domain" ]; then
  report 1 "chromium with run.py's profile loads through the egress container" ""
else
  report 0 "chromium with run.py's profile loads through the egress container" "got '$title'"
fi

# 3. Host-Dienst: aus dem Agent über keine Host-Adresse erreichbar, vom
#    Egress-Container (normales Netz) schon — die Gegenprobe. Das interne Netz
#    hat keine Gateway-IP (isolated); geprüft werden die Gateways der anderen Netze.
gw_internal=$(docker network inspect -f '{{range .IPAM.Config}}{{.Gateway}} {{end}}' "$INTERNAL" | awk '{print $1}')
gw_egress=$(docker network inspect -f '{{range .IPAM.Config}}{{.Gateway}} {{end}}' "$EGRESS_NET" | awk '{print $1}')
gw_bridge=$(docker network inspect -f '{{range .IPAM.Config}}{{.Gateway}} {{end}}' bridge | awk '{print $1}')
reached=""
for h in $gw_internal "$gw_egress" "$gw_bridge"; do
  if tcp_probe "$h" "$HOST_PORT"; then reached="$reached $h"; fi
done
report "$([ -z "$reached" ] && echo 1 || echo 0)" "agent cannot reach a host service" "open on:$reached"
if docker exec "$P-egress" python -c "import socket; socket.create_connection(('$gw_egress', $HOST_PORT), timeout=5).close()" 2>/dev/null; then
  report 1 "control: host service is reachable from a normal network" ""
else
  report 0 "control: host service is reachable from a normal network" "$gw_egress:$HOST_PORT closed - probe proves nothing"
fi
# 4. Über den Proxy an den Host-Dienst bzw. den Proxy selbst: der Proxy verweigert (403).
for target in "$gw_egress:$HOST_PORT" "$P-egress:8899"; do
  code=$(in_agent python -c "
import httpx
try:
    print(httpx.get('http://$target/', timeout=8, proxy='http://$P-egress:8899').status_code)
except httpx.HTTPError as e:
    print(type(e).__name__)
" 2>/dev/null || true)
  # Port $HOST_PORT/8899 ist nicht 80/443, also 403 schon an der Portregel; deshalb
  # zusätzlich mit erlaubtem Port gegen die interne Egress-IP.
  report "$([ "$code" = 403 ] && echo 1 || echo 0)" "proxy refuses $target" "got $code"
done
egress_ip=$(docker inspect -f "{{(index .NetworkSettings.Networks \"$INTERNAL\").IPAddress}}" "$P-egress")
code=$(in_agent python -c "
import httpx
print(httpx.get('http://$egress_ip/', timeout=8, proxy='http://$P-egress:8899').status_code)
" 2>/dev/null || true)
report "$([ "$code" = 403 ] && echo 1 || echo 0)" "proxy refuses the internal network on port 80" "got $code"

echo "$fails failure(s)"
exit "$([ "$fails" = 0 ] && echo 0 || echo 1)"
