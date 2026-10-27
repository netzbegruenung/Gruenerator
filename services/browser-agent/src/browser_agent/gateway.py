"""Der einzige Übergang zwischen dem Browser-Netz und dem Rest (Container ``browser-gateway``).

Chromium läuft ohne Sandbox; ein übernommener Browser-Container soll deshalb
weder ins Internet noch an die API kommen, außer über genau drei Türen in
diesem Container:

- ``:8899`` Egress-Proxy (``egress.py``): nur öffentliche Ziele, Ports 80/443.
- ``:8898`` Modell: nur ``POST /api/browser-agent/llm/v1/chat/completions``,
  weitergereicht an die API mit nichts als ``Authorization`` und
  ``Content-Type``. Ohne diese Tür bräuchte der Agent ein Netz mit der API, und
  dort läge die ganze API offen, ohne nginx davor.
- ``:8000`` Läufe: TCP-Weiterleitung der API zum Agent (``POST /runs``,
  ``DELETE``, ``/health``). Der Agent prüft dort selbst sein Geheimnis; ein
  Abbruch der Verbindung kommt als TCP-Abbau beim Agent an.

Der Container hält kein Geheimnis.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

import httpx
import uvicorn
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

from browser_agent.egress import _tunnel, resolve_blocked_hosts, start_egress_proxy

logger = logging.getLogger(__name__)

LLM_PATH = "/api/browser-agent/llm/v1/chat/completions"
# Über dem Limit der API (20 MB, llmProxyRouter.ts), damit sie und nicht wir ablehnt.
_MAX_BODY = 21 * 1024 * 1024
# Über dem Schritt-Timeout der API (75 s), unter dem HTTP-Timeout von browser-use (120 s).
_UPSTREAM_TIMEOUT = 110.0
_FORWARD_HEADERS = ("authorization", "content-type")
# Zwei parallele Läufe (BROWSER_MAX_PARALLEL) mit je einem Modellaufruf; darüber 503.
_LLM_CONCURRENCY = 8


class _TooLarge(Exception):
    pass


def create_llm_app(upstream: str, transport: httpx.AsyncBaseTransport | None = None) -> Starlette:
    client = httpx.AsyncClient(base_url=upstream, timeout=_UPSTREAM_TIMEOUT, transport=transport)

    async def completions(request: Request) -> Response:
        declared = request.headers.get("content-length")
        if declared is not None and (not declared.isdigit() or int(declared) > _MAX_BODY):
            return Response(status_code=413)

        # Durchreichen statt puffern: gleichzeitige 21-MB-Anfragen im Speicher
        # könnten den Host (ohne Swap) in den OOM-Killer treiben — und der
        # wählt sein Opfer selbst, womöglich die API.
        async def body():
            seen = 0
            async for chunk in request.stream():
                seen += len(chunk)
                if seen > _MAX_BODY:
                    raise _TooLarge
                yield chunk

        headers = {k: v for k in _FORWARD_HEADERS if (v := request.headers.get(k)) is not None}
        try:
            # Gesamtfrist inkl. Lesen des Bodys: ein tröpfelnder Client hält sonst ewig einen Platz.
            async with asyncio.timeout(_UPSTREAM_TIMEOUT):
                up = await client.post(LLM_PATH, content=body(), headers=headers)
        except _TooLarge:
            return Response(status_code=413)
        except TimeoutError:
            return Response(status_code=504)
        except httpx.HTTPError as e:
            logger.warning("LLM-Upstream nicht erreichbar: %s", type(e).__name__)
            return Response(status_code=502)
        return Response(up.content, status_code=up.status_code, media_type=up.headers.get("content-type"))

    async def refuse(_request: Request) -> Response:
        return Response(status_code=404)

    @asynccontextmanager
    async def lifespan(_app: Starlette):
        try:
            yield
        finally:
            await client.aclose()

    return Starlette(
        lifespan=lifespan,
        routes=[
            Route(LLM_PATH, completions, methods=["POST"]),
            Route("/{path:path}", refuse, methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
        ],
    )


async def start_tcp_forward(host: str, port: int, upstream_host: str, upstream_port: int) -> asyncio.AbstractServer:
    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            up_r, up_w = await asyncio.wait_for(asyncio.open_connection(upstream_host, upstream_port), 15)
        except (OSError, TimeoutError):
            writer.close()
            return
        await _tunnel(reader, writer, up_r, up_w)

    return await asyncio.start_server(handle, host, port)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    host = os.environ.get("BROWSER_GATEWAY_HOST", "0.0.0.0")
    api_upstream = os.environ["BROWSER_GATEWAY_API_UPSTREAM"]
    agent_host, _, agent_port = os.environ["BROWSER_GATEWAY_AGENT_UPSTREAM"].rpartition(":")

    async def serve() -> None:
        # Ein ungültiger BROWSER_EGRESS_EXTRA_BLOCKED-Eintrag lässt den Start scheitern.
        extra = os.environ.get("BROWSER_EGRESS_EXTRA_BLOCKED", "").split(",")
        extra += resolve_blocked_hosts(os.environ.get("BROWSER_EGRESS_BLOCKED_HOSTS", ""))
        egress = await start_egress_proxy(host, 8899, extra)
        runs = await start_tcp_forward(host, 8000, agent_host, int(agent_port))
        llm = uvicorn.Server(uvicorn.Config(create_llm_app(api_upstream), host=host, port=8898, log_level="warning",
                                                 limit_concurrency=_LLM_CONCURRENCY))
        async with egress, runs:
            await asyncio.gather(egress.serve_forever(), runs.serve_forever(), llm.serve())

    asyncio.run(serve())
