"""HTTP-Schnittstelle: POST /runs streamt NDJSON, DELETE /runs/{id} bricht ab."""

import hmac
import json
import logging
import os
from collections.abc import Callable
from contextlib import aclosing, asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

import anyio
from fastapi import FastAPI, Header, HTTPException, Response
from pydantic import BaseModel, Field, field_validator
from starlette.responses import StreamingResponse

from browser_agent.egress import start_egress_proxy
from browser_agent.run import RunControl, build_agent, execute_run

logger = logging.getLogger(__name__)

PROXY_HOST = "127.0.0.1"
PROXY_PORT = 8899


class RunRequest(BaseModel):
    run_id: str = Field(min_length=1, max_length=200)
    task: str = Field(min_length=1)
    start_url: str
    llm_base_url: str
    llm_token: str
    max_steps: int = Field(default=25, ge=1, le=25)

    @field_validator("start_url")
    @classmethod
    def _http_only(cls, v: str) -> str:
        if urlsplit(v).scheme not in ("http", "https"):
            raise ValueError("start_url muss http(s) sein")
        return v


class _RunResponse(StreamingResponse):
    """Bricht den Lauf ab, sobald der Client weg ist — nicht erst beim nächsten Schreiben.

    Starlette lauscht ab ASGI 2.4 nicht mehr auf ``http.disconnect`` und merkt den
    Abbruch erst am nächsten ``send``; ein LLM-Schritt kann aber 20 s dauern.
    """

    def __init__(self, content, release: Callable[[], None]):
        super().__init__(content, media_type="application/x-ndjson")
        self._release = release

    async def __call__(self, scope, receive, send) -> None:
        try:
            async with anyio.create_task_group() as tg:

                async def stream() -> None:
                    try:
                        await self.stream_response(send)
                    except OSError:
                        pass
                    tg.cancel_scope.cancel()

                async def listen() -> None:
                    await self.listen_for_disconnect(receive)
                    tg.cancel_scope.cancel()

                tg.start_soon(stream)
                tg.start_soon(listen)
        finally:
            with anyio.CancelScope(shield=True):
                # Hing der Generator an einem `yield`, läuft sein Aufräumen erst hier.
                await self.body_iterator.aclose()
            self._release()


def create_app(
    agent_factory: Callable = build_agent,
    *,
    start_proxy: bool = True,
    runs_dir: Path | None = None,
) -> FastAPI:
    secret = os.environ.get("BROWSER_AGENT_SECRET", "")
    if not secret:
        logger.warning("BROWSER_AGENT_SECRET ist leer: alle Läufe werden mit 401 abgewiesen")
    max_parallel = int(os.environ.get("BROWSER_MAX_PARALLEL", "2"))
    runs: dict[str, RunControl] = {}

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        server = None
        if start_proxy:
            # Nur Loopback; ein ungültiger BROWSER_EGRESS_EXTRA_BLOCKED-Eintrag lässt den Start scheitern.
            extra = os.environ.get("BROWSER_EGRESS_EXTRA_BLOCKED", "")
            server = await start_egress_proxy(PROXY_HOST, PROXY_PORT, [p for p in extra.split(",") if p.strip()])
        try:
            yield
        finally:
            if server is not None:
                server.close()
                await server.wait_closed()

    app = FastAPI(lifespan=lifespan)

    def check_secret(value: str | None) -> None:
        if not secret or value is None or not hmac.compare_digest(value.encode(), secret.encode()):
            raise HTTPException(status_code=401)

    @app.get("/health")
    async def health() -> dict:
        return {"ok": True, "running": len(runs)}

    @app.post("/runs")
    async def start_run(
        body: RunRequest, x_browser_agent_secret: str | None = Header(default=None)
    ) -> Response:
        check_secret(x_browser_agent_secret)
        if body.run_id in runs:
            raise HTTPException(status_code=409, detail="run_id läuft bereits")
        if len(runs) >= max_parallel:
            raise HTTPException(status_code=429, detail="Browser-Agent ausgelastet")
        control = RunControl()
        runs[body.run_id] = control

        async def lines():
            # aclosing: sonst bliebe das Aufräumen von execute_run beim Abbruch dem GC überlassen.
            run = execute_run(body.model_dump(), agent_factory, base_dir=runs_dir, control=control)
            async with aclosing(run) as events:
                async for event in events:
                    yield json.dumps(event, ensure_ascii=False) + "\n"

        return _RunResponse(lines(), release=lambda: runs.pop(body.run_id, None))

    @app.delete("/runs/{run_id}", status_code=204)
    async def cancel_run(run_id: str, x_browser_agent_secret: str | None = Header(default=None)) -> Response:
        check_secret(x_browser_agent_secret)
        control = runs.get(run_id)
        if control is not None:
            control.cancel()
        return Response(status_code=204)

    return app


def main() -> None:
    import uvicorn

    uvicorn.run(create_app(), host=os.environ.get("HOST", "0.0.0.0"), port=int(os.environ.get("PORT", "8000")))
