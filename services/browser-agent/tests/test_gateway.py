import asyncio

import httpx
import pytest
from starlette.testclient import TestClient

from browser_agent.gateway import LLM_PATH, create_llm_app, start_tcp_forward

seen: list[httpx.Request] = []


def _upstream(request: httpx.Request) -> httpx.Response:
    seen.append(request)
    return httpx.Response(200, json={"ok": True}, headers={"x-internal": "leak"})


@pytest.fixture
def client():
    seen.clear()
    with TestClient(create_llm_app("http://api:3001", transport=httpx.MockTransport(_upstream))) as c:
        yield c


def test_forwards_only_the_llm_path_with_auth_and_content_type(client):
    r = client.post(LLM_PATH, content=b'{"messages":[]}', headers={
        "Authorization": "Bearer tok", "Content-Type": "application/json",
        "Cookie": "sid=x", "X-Forwarded-For": "1.2.3.4", "Host": "evil",
    })
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert "x-internal" not in r.headers
    (req,) = seen
    assert str(req.url) == f"http://api:3001{LLM_PATH}"
    assert req.headers["authorization"] == "Bearer tok"
    assert "cookie" not in req.headers and "x-forwarded-for" not in req.headers
    assert req.headers["host"] == "api:3001"
    assert req.content == b'{"messages":[]}'


@pytest.mark.parametrize(("method", "path"), [
    ("GET", LLM_PATH),
    ("POST", "/api/auth/session"),
    ("POST", LLM_PATH + "/../../../auth/session"),
    ("POST", "/api/browser-agent/llm/v1/models"),
    ("GET", "/health"),
    ("DELETE", "/api/chat-service/threads/1"),
])
def test_refuses_everything_else(client, method, path):
    r = client.request(method, path)
    assert r.status_code in (404, 405)
    assert seen == []


def test_refuses_oversized_bodies(client, monkeypatch):
    import browser_agent.gateway as gw

    monkeypatch.setattr(gw, "_MAX_BODY", 10)
    with TestClient(gw.create_llm_app("http://api:3001", transport=httpx.MockTransport(_upstream))) as c:
        assert c.post(LLM_PATH, content=b"x" * 11).status_code == 413
    assert seen == []


def test_upstream_down_is_502():
    def boom(request):
        raise httpx.ConnectError("down")

    with TestClient(create_llm_app("http://api:3001", transport=httpx.MockTransport(boom))) as c:
        assert c.post(LLM_PATH, content=b"{}").status_code == 502


async def test_tcp_forward_relays_both_ways():
    async def echo(reader, writer):
        writer.write(b"pong:" + await reader.readexactly(4))
        await writer.drain()
        writer.close()

    upstream = await asyncio.start_server(echo, "127.0.0.1", 0)
    up_port = upstream.sockets[0].getsockname()[1]
    fwd = await start_tcp_forward("127.0.0.1", 0, "127.0.0.1", up_port)
    port = fwd.sockets[0].getsockname()[1]
    r, w = await asyncio.open_connection("127.0.0.1", port)
    w.write(b"ping")
    await w.drain()
    assert await r.read() == b"pong:ping"
    w.close()
    for s in (fwd, upstream):
        s.close()
        await s.wait_closed()
