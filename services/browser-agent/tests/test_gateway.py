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


def test_streamed_body_over_the_limit_is_413(monkeypatch):
    import browser_agent.gateway as gw

    monkeypatch.setattr(gw, "_MAX_BODY", 10)
    seen.clear()

    def chunks():
        yield b"x" * 6
        yield b"x" * 6

    with TestClient(gw.create_llm_app("http://api:3001", transport=httpx.MockTransport(_upstream))) as c:
        # Ohne Content-Length (chunked): erst das Zählen beim Durchreichen greift.
        assert c.post(LLM_PATH, content=chunks()).status_code == 413


def test_slow_upstream_hits_the_total_deadline(monkeypatch):
    import browser_agent.gateway as gw

    monkeypatch.setattr(gw, "_UPSTREAM_TIMEOUT", 0.2)

    async def slow(request):
        await asyncio.sleep(2)
        return httpx.Response(200)

    with TestClient(gw.create_llm_app("http://api:3001", transport=httpx.MockTransport(slow))) as c:
        assert c.post(LLM_PATH, content=b"{}").status_code == 504


def test_blocked_hosts_resolve_to_every_address(monkeypatch):
    import socket

    from browser_agent import egress

    def fake(host, port, type=0):
        assert host == "qdrant.example"
        return [(0, 0, 0, "", ("203.0.113.7", port)), (0, 0, 0, "", ("2001:db8::7", port, 0, 0)),
                (0, 0, 0, "", ("203.0.113.7", port))]

    monkeypatch.setattr(socket, "getaddrinfo", fake)
    assert egress.resolve_blocked_hosts(" qdrant.example, ") == ["2001:db8::7", "203.0.113.7"]
    assert egress.resolve_blocked_hosts("") == []
