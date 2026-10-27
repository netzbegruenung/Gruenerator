import asyncio
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from browser_agent.api import create_app

SECRET = "s3cret"
BODY = {"run_id": "r1", "task": "t", "start_url": "https://example.org", "llm_base_url": "http://x", "llm_token": "tok"}
HEADERS = {"X-Browser-Agent-Secret": SECRET}


class FakeAgent:
    def __init__(self, workdir, on_step, steps, delay):
        self.workdir = workdir
        self.on_step = on_step
        self.steps = steps
        self.delay = delay
        self.stop_called = False
        (workdir / "profile").mkdir(parents=True, exist_ok=True)

    async def run(self, max_steps):
        for n in range(1, self.steps + 1):
            if self.stop_called:
                break
            out = SimpleNamespace(next_goal=None, thinking=None,
                                  action=[SimpleNamespace(model_dump=lambda **kw: {"wait": {"seconds": 1}})])
            state = SimpleNamespace(url="https://example.org", title="x", screenshot=None, page_info=None,
                                    dom_state=SimpleNamespace(selector_map={}))
            await self.on_step(state, out, n)
            await asyncio.sleep(self.delay)
        return SimpleNamespace(final_result=lambda: "ok", is_successful=lambda: True, number_of_steps=lambda: n)

    def stop(self):
        self.stop_called = True

    async def close(self):
        pass


@pytest.fixture
def fake_agent():
    """Fabrik + Liste der erzeugten Agents; `steps`/`delay` pro Test einstellbar."""
    ns = SimpleNamespace(made=[], steps=2, delay=0.0)

    def factory(*, workdir, on_step, **kw):
        agent = FakeAgent(workdir, on_step, ns.steps, ns.delay)
        ns.made.append(agent)
        return agent

    ns.factory = factory
    return ns


@pytest.fixture
def make_app(fake_agent, tmp_path, monkeypatch):
    monkeypatch.setenv("BROWSER_AGENT_SECRET", SECRET)

    def make():
        return create_app(agent_factory=fake_agent.factory, start_proxy=False, runs_dir=tmp_path)

    return make


@pytest.fixture
def client(make_app):
    with TestClient(make_app()) as c:
        yield c


def test_health(client):
    assert client.get("/health").status_code == 200


def test_requires_secret(client):
    assert client.post("/runs", json=BODY).status_code == 401
    assert client.post("/runs", json=BODY, headers={"X-Browser-Agent-Secret": "falsch"}).status_code == 401
    assert client.delete("/runs/r1").status_code == 401


def test_rejects_non_http_start_url(client):
    assert client.post("/runs", json={**BODY, "start_url": "file:///etc/passwd"}, headers=HEADERS).status_code == 422


def test_stream_ndjson(client, fake_agent):
    r = client.post("/runs", json=BODY, headers=HEADERS)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/x-ndjson")
    lines = [json.loads(line) for line in r.text.splitlines() if line]
    assert [e["type"] for e in lines] == ["step", "step", "done"]


async def _drive(app, body, disconnect_after_first_chunk):
    """Ruft die ASGI-App direkt; nach dem ersten Body-Stück meldet der Client http.disconnect."""
    first_chunk = asyncio.Event()
    sent = []
    payload = json.dumps(body).encode()
    request_sent = False

    async def receive():
        nonlocal request_sent
        if not request_sent:
            request_sent = True
            return {"type": "http.request", "body": payload, "more_body": False}
        if disconnect_after_first_chunk:
            await first_chunk.wait()
            return {"type": "http.disconnect"}
        await asyncio.Event().wait()

    async def send(message):
        sent.append(message)
        if message["type"] == "http.response.body" and message.get("body"):
            first_chunk.set()

    scope = {
        "type": "http", "asgi": {"version": "3.0", "spec_version": "2.4"}, "http_version": "1.1", "method": "POST",
        "scheme": "http", "path": "/runs", "raw_path": b"/runs", "query_string": b"", "root_path": "",
        "headers": [(b"content-type", b"application/json"), (b"x-browser-agent-secret", SECRET.encode())],
        "client": ("test", 1), "server": ("test", 80),
    }
    await asyncio.wait_for(app(scope, receive, send), 5)
    return sent


async def test_disconnect_cancels_run(make_app, fake_agent):
    fake_agent.steps = 1000
    fake_agent.delay = 0.01
    app = make_app()
    await _drive(app, BODY, disconnect_after_first_chunk=True)
    agent = fake_agent.made[0]
    assert agent.stop_called
    assert not agent.workdir.exists()


async def test_busy_returns_429(fake_agent, monkeypatch, tmp_path):
    monkeypatch.setenv("BROWSER_AGENT_SECRET", SECRET)
    monkeypatch.setenv("BROWSER_MAX_PARALLEL", "1")
    fake_agent.steps = 1000
    fake_agent.delay = 0.01
    app = create_app(agent_factory=fake_agent.factory, start_proxy=False, runs_dir=tmp_path)
    first = asyncio.create_task(_drive(app, BODY, disconnect_after_first_chunk=False))
    while not fake_agent.made:
        await asyncio.sleep(0.01)
    sent = await _drive(app, {**BODY, "run_id": "r2"}, disconnect_after_first_chunk=False)
    assert sent[0]["status"] == 429
    # DELETE beendet den ersten Lauf, danach ist wieder Platz.
    import httpx
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        r = await c.delete("/runs/r1", headers=HEADERS)
        assert r.status_code == 204
    await asyncio.wait_for(first, 5)
    assert fake_agent.made[0].stop_called
