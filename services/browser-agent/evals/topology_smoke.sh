#!/usr/bin/env bash
# Prüft die Betriebs-Topologie (Salt docker-compose.yml.j2): der Browser-Agent
# hängt allein in einem Docker-Netz ohne Ausgang und ohne Gateway-Adresse, die
# API in einem zweiten solchen Netz, und der einzige Container in beiden (und
# im Internet) ist `browser-gateway` (gateway.py). Ein Renderer-Exploit im
# Chromium ohne Sandbox soll nur durch dessen drei Türen kommen: Egress-Proxy,
# den einen Modell-Pfad der API, und — umgekehrt — die API zu den Läufen.
#
#   services/browser-agent/evals/topology_smoke.sh gruenerator-browser-agent:pr
#
# Jeder „gesperrt“-Fall hat eine Gegenprobe, die zeigt, dass das Ziel
# erreichbar ist, wo die Sperre nicht gilt. Braucht Internet (example.com).
set -euo pipefail

IMAGE=${1:?Image angeben}
P=bat-$$
INTERNAL=$P-internal
CONTROL=$P-control
EGRESS_NET=$P-egress
GW=$P-gw
LLM_PATH=/api/browser-agent/llm/v1/chat/completions
HOST_PORT=18765
fails=0

cleanup() {
  docker rm -f "$GW" "$P-host" "$P-api" "$P-agent" >/dev/null 2>&1 || true
  docker network rm "$INTERNAL" "$CONTROL" "$EGRESS_NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

report() { # ok name detail
  if [ "$1" = 1 ]; then echo "PASS $2"; else echo "FAIL $2 ($3)"; fails=$((fails + 1)); fi
}

# Python-Probe im Browser-Netz (Stellvertreter für einen übernommenen Agent).
in_agent() {
  docker run --rm --network "$INTERNAL" -e BROWSER_EGRESS_PROXY="http://$GW:8899" "$IMAGE" "$@"
}
# Dasselbe im Netz der API.
in_control() {
  docker run --rm --network "$CONTROL" "$IMAGE" "$@"
}
tcp_probe() { # host port [runner]
  ${3:-in_agent} python -c "
import socket, sys
try:
    socket.create_connection(('$1', $2), timeout=5).close()
except OSError:
    sys.exit(1)
"
}

# Wie in Salt: ohne Gateway-Adresse. Ein bloßes `internal: true` lässt den Host
# über die Gateway-IP erreichbar (gemessen 27.10.2026, Docker 29.5) — Fall 3.
for net in "$INTERNAL" "$CONTROL"; do
  docker network create --internal \
    -o com.docker.network.bridge.gateway_mode_ipv4=isolated \
    -o com.docker.network.bridge.gateway_mode_ipv6=isolated \
    "$net" >/dev/null
done
docker network create "$EGRESS_NET" >/dev/null
# API-Attrappe: antwortet auf alles mit 200 und zählt, welche Pfade ankamen.
docker run -d --name "$P-api" --network "$CONTROL" "$IMAGE" python -c "
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
class H(BaseHTTPRequestHandler):
    def _any(self):
        n = int(self.headers.get('content-length') or 0)
        self.rfile.read(n)
        open('/tmp/paths', 'a').write(self.command + ' ' + self.path + chr(10))
        self.send_response(200); self.send_header('content-type', 'application/json'); self.end_headers()
        self.wfile.write(b'{\"stub\":true}')
    do_GET = do_POST = do_DELETE = _any
ThreadingHTTPServer(('0.0.0.0', 3001), H).serve_forever()
" >/dev/null
docker run -d --name "$P-agent" --network "$INTERNAL" -e BROWSER_AGENT_SECRET=s \
  -e BROWSER_EGRESS_PROXY="http://$GW:8899" "$IMAGE" >/dev/null
docker run -d --name "$GW" --network "$EGRESS_NET" \
  -e BROWSER_GATEWAY_API_UPSTREAM="http://$P-api:3001" \
  -e BROWSER_GATEWAY_AGENT_UPSTREAM="$P-agent:8000" \
  "$IMAGE" python -c "from browser_agent.gateway import main; main()" >/dev/null
docker network connect "$INTERNAL" "$GW"
docker network connect "$CONTROL" "$GW"
# Ein Dienst auf dem Host (wie Postgres auf host.docker.internal): Ziel für die Gateway-Probe.
docker run -d --name "$P-host" --network host "$IMAGE" python -m http.server "$HOST_PORT" --bind 0.0.0.0 >/dev/null

for _ in $(seq 1 30); do
  tcp_probe "$GW" 8899 && tcp_probe "$GW" 8898 && tcp_probe "$P-agent" 8000 && break
  sleep 1
done

# 1. Direkt ins Internet: gesperrt; über den Proxy-Container: geht.
if in_agent python -c "import httpx; httpx.get('https://example.com', timeout=8)" >/dev/null 2>&1; then
  report 0 "agent cannot reach the internet directly" "direct https://example.com loaded"
else
  report 1 "agent cannot reach the internet directly" ""
fi
if in_agent python -c "import httpx; httpx.get('https://example.com', timeout=15, proxy='http://$GW:8899').raise_for_status()" >/dev/null 2>&1; then
  report 1 "agent reaches the internet through the gateway container" ""
else
  report 0 "agent reaches the internet through the gateway container" "proxied https://example.com failed"
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
  report 1 "chromium with run.py's profile loads through the gateway container" ""
else
  report 0 "chromium with run.py's profile loads through the gateway container" "got '$title'"
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
if docker exec "$GW" python -c "import socket; socket.create_connection(('$gw_egress', $HOST_PORT), timeout=5).close()" 2>/dev/null; then
  report 1 "control: host service is reachable from a normal network" ""
else
  report 0 "control: host service is reachable from a normal network" "$gw_egress:$HOST_PORT closed - probe proves nothing"
fi
# 4. Über den Proxy an den Host-Dienst bzw. den Proxy selbst: der Proxy verweigert (403).
for target in "$gw_egress:$HOST_PORT" "$GW:8899"; do
  code=$(in_agent python -c "
import httpx
try:
    print(httpx.get('http://$target/', timeout=8, proxy='http://$GW:8899').status_code)
except httpx.HTTPError as e:
    print(type(e).__name__)
" 2>/dev/null || true)
  # Port $HOST_PORT/8899 ist nicht 80/443, also 403 schon an der Portregel; deshalb
  # zusätzlich mit erlaubtem Port gegen die interne Egress-IP.
  report "$([ "$code" = 403 ] && echo 1 || echo 0)" "proxy refuses $target" "got $code"
done
egress_ip=$(docker inspect -f "{{(index .NetworkSettings.Networks \"$INTERNAL\").IPAddress}}" "$GW")
code=$(in_agent python -c "
import httpx
print(httpx.get('http://$egress_ip/', timeout=8, proxy='http://$GW:8899').status_code)
" 2>/dev/null || true)
report "$([ "$code" = 403 ] && echo 1 || echo 0)" "proxy refuses the internal network on port 80" "got $code"

# 5. Die API ist aus dem Browser-Netz nicht direkt erreichbar, auch nicht per IP;
#    vom Gateway aus schon (Gegenprobe). Umgekehrt erreicht die API den Agent nur übers Gateway.
api_ip=$(docker inspect -f "{{(index .NetworkSettings.Networks \"$CONTROL\").IPAddress}}" "$P-api")
agent_ip=$(docker inspect -f "{{(index .NetworkSettings.Networks \"$INTERNAL\").IPAddress}}" "$P-agent")
if tcp_probe "$P-api" 3001 || tcp_probe "$api_ip" 3001; then
  report 0 "agent cannot reach the API directly" "$api_ip:3001 open"
else
  report 1 "agent cannot reach the API directly" ""
fi
if docker exec "$GW" python -c "import socket; socket.create_connection(('$P-api', 3001), timeout=5).close()" 2>/dev/null; then
  report 1 "control: the gateway reaches the API" ""
else
  report 0 "control: the gateway reaches the API" "probe proves nothing"
fi
if tcp_probe "$P-agent" 8000 in_control || tcp_probe "$agent_ip" 8000 in_control; then
  report 0 "the API network cannot reach the agent directly" "$agent_ip:8000 open"
else
  report 1 "the API network cannot reach the agent directly" ""
fi

# 6. Durchs Gateway: der eine Modell-Pfad kommt an, jeder andere nicht.
llm=$(in_agent python -c "
import httpx
print(httpx.post('http://$GW:8898$LLM_PATH', json={}, headers={'Authorization': 'Bearer t'}, timeout=10).status_code)
" 2>/dev/null || true)
report "$([ "$llm" = 200 ] && echo 1 || echo 0)" "agent reaches the model path through the gateway" "got $llm"
others=$(in_agent python -c "
import httpx
for m, p in [('GET', '/api/auth/session'), ('POST', '/api/chat-service/threads'), ('GET', '$LLM_PATH'),
             ('POST', '/api/browser-agent/llm/v1/models'), ('GET', '/health')]:
    print(m, p, httpx.request(m, 'http://$GW:8898' + p, timeout=10).status_code)
" 2>/dev/null || true)
seen=$(docker exec "$P-api" cat /tmp/paths 2>/dev/null || true)
if [ "$seen" = "POST $LLM_PATH" ] && ! grep -q ' 200$' <<<"$others"; then
  report 1 "gateway forwards nothing but the model path" ""
else
  report 0 "gateway forwards nothing but the model path" "api saw: $(tr '\n' '|' <<<"$seen") / gateway: $(tr '\n' '|' <<<"$others")"
fi

# 7. Die API erreicht den Agent über das Gateway; ohne Geheimnis weist der Agent ab.
health=$(in_control python -c "
import httpx
print(httpx.get('http://$GW:8000/health', timeout=10).json().get('ok'), httpx.post('http://$GW:8000/runs', json={'run_id': 'r', 'task': 't', 'start_url': 'https://example.com', 'llm_base_url': 'http://x', 'llm_token': 't'}, timeout=10).status_code)
" 2>/dev/null || true)
report "$([ "$health" = "True 401" ] && echo 1 || echo 0)" "API reaches the agent through the gateway (secret still required)" "got $health"

echo "$fails failure(s)"
exit "$([ "$fails" = 0 ] && echo 0 || echo 1)"
