import asyncio
import ipaddress
import socket

import pytest

from browser_agent import egress
from browser_agent.egress import is_blocked, start_egress_proxy


@pytest.mark.parametrize(
    "ip",
    ["169.254.169.254", "10.0.0.1", "100.64.0.1", "127.0.0.1", "0.1.2.3", "172.16.0.1",
     "192.168.1.1", "224.0.0.1", "255.255.255.255", "::1", "fd12::1", "fe90::1",
     "fec0::1", "ff02::1", "::ffff:a9fe:a9fe", "::ffff:127.0.0.1", "::", "64:ff9b::a9fe:a9fe", "64:ff9b::a00:5"],
)
def test_blocks_private(ip):
    assert is_blocked(ip, [])


@pytest.mark.parametrize("ip", ["8.8.8.8", "2001:4860:4860::8888", "100.128.0.1", "172.32.0.1", "64:ff9b::808:808"])
def test_allows_public(ip):
    assert not is_blocked(ip, [])


def test_unparseable_is_blocked():
    assert is_blocked("not-an-ip", [])


def test_extra_blocked():
    assert is_blocked("203.0.113.7", [ipaddress.ip_network("203.0.113.0/24")])


def test_parse_extra_blocked():
    nets = egress.parse_extra_blocked("203.0.113.0/24, 198.51.100.9 ,")
    assert is_blocked("198.51.100.9", nets)
    assert is_blocked("203.0.113.1", nets)


@pytest.fixture
async def proxy():
    server = await start_egress_proxy("127.0.0.1", 0, [])
    port = server.sockets[0].getsockname()[1]
    yield port
    server.close()
    await server.wait_closed()


@pytest.fixture
async def stub():
    """Loopback HTTP/echo stub; returns (port, received-requests list)."""
    received: list[bytes] = []

    async def handle(reader, writer):
        data = await reader.read(65536)
        received.append(data)
        if data.startswith(b"GET "):
            body = b"hello"
            writer.write(b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\n" + body)
        else:
            writer.write(b"echo:" + data)
        await writer.drain()
        writer.close()

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    yield server.sockets[0].getsockname()[1], received
    server.close()
    await server.wait_closed()


async def roundtrip(port: int, payload: bytes) -> bytes:
    reader, writer = await asyncio.open_connection("127.0.0.1", port)
    writer.write(payload)
    await writer.drain()
    data = await asyncio.wait_for(reader.read(65536), 5)
    writer.close()
    return data


async def test_proxy_refuses_connect_to_private(proxy):
    resp = await roundtrip(proxy, b"CONNECT 127.0.0.1:443 HTTP/1.1\r\nHost: 127.0.0.1:443\r\n\r\n")
    assert resp.startswith(b"HTTP/1.1 403")


async def test_proxy_refuses_bracketed_ipv6_literal(proxy):
    resp = await roundtrip(proxy, b"CONNECT [::1]:443 HTTP/1.1\r\nHost: [::1]:443\r\n\r\n")
    assert resp.startswith(b"HTTP/1.1 403")


async def test_proxy_refuses_plain_http_to_metadata(proxy):
    resp = await roundtrip(
        proxy, b"GET http://169.254.169.254/latest/meta-data/ HTTP/1.1\r\nHost: 169.254.169.254\r\n\r\n"
    )
    assert resp.startswith(b"HTTP/1.1 403")


async def test_proxy_refuses_name_resolving_private(proxy, monkeypatch):
    async def fake_getaddrinfo(self, host, port, **kw):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.5", port))]

    monkeypatch.setattr(asyncio.get_running_loop().__class__, "getaddrinfo", fake_getaddrinfo)
    resp = await roundtrip(proxy, b"CONNECT internal.example:443 HTTP/1.1\r\nHost: internal.example:443\r\n\r\n")
    assert resp.startswith(b"HTTP/1.1 403")


async def test_proxy_refuses_when_any_address_is_private(proxy, monkeypatch):
    async def fake_getaddrinfo(self, host, port, **kw):
        return [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", port)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.5", port)),
        ]

    monkeypatch.setattr(asyncio.get_running_loop().__class__, "getaddrinfo", fake_getaddrinfo)
    resp = await roundtrip(proxy, b"CONNECT mixed.example:443 HTTP/1.1\r\n\r\n")
    assert resp.startswith(b"HTTP/1.1 403")


async def test_proxy_rejects_other_methods(proxy):
    resp = await roundtrip(proxy, b"TRACE http://example.com/ HTTP/1.1\r\nHost: example.com\r\n\r\n")
    assert resp.startswith(b"HTTP/1.1 405")


def allow_loopback_for_public_name(monkeypatch, stub_port):
    """TEST SEAM: map the public-looking name `public.example` to the loopback
    stub. Both the resolver and `is_blocked` are patched, and only inside the
    test using this helper, because a real public host would need the internet
    and loopback is otherwise (correctly) blocked. The patch lets any 127.0.0.1
    through, so it proves the forwarding path only, not the blocklist."""

    async def fake_getaddrinfo(self, host, port, **kw):
        assert host == "public.example"
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port))]

    monkeypatch.setattr(asyncio.get_running_loop().__class__, "getaddrinfo", fake_getaddrinfo)
    monkeypatch.setattr(egress, "is_blocked", lambda ip, extra: False)


async def open_proxy_allowing(port: int):
    server = await start_egress_proxy("127.0.0.1", 0, [], allowed_ports=frozenset({port}))
    return server, server.sockets[0].getsockname()[1]


async def test_proxy_refuses_disallowed_ports(proxy, stub, monkeypatch):
    stub_port, received = stub
    allow_loopback_for_public_name(monkeypatch, stub_port)
    resp = await roundtrip(proxy, b"CONNECT public.example:5432 HTTP/1.1\r\n\r\n")
    assert resp.startswith(b"HTTP/1.1 403")
    resp = await roundtrip(proxy, b"GET http://public.example:8080/ HTTP/1.1\r\nHost: public.example:8080\r\n\r\n")
    assert resp.startswith(b"HTTP/1.1 403")
    assert received == []


async def test_proxy_allows_default_port_443(proxy, monkeypatch):
    # Port 443 passes the port check; the connect then fails (nothing listens
    # on loopback:443), which shows as 502 and not as 403.
    allow_loopback_for_public_name(monkeypatch, 443)
    resp = await roundtrip(proxy, b"CONNECT public.example:443 HTTP/1.1\r\n\r\n")
    assert not resp.startswith(b"HTTP/1.1 403")


def test_allowed_ports_from_env(monkeypatch):
    monkeypatch.delenv("BROWSER_EGRESS_ALLOWED_PORTS", raising=False)
    assert egress.allowed_ports_from_env() == {80, 443}
    monkeypatch.setenv("BROWSER_EGRESS_ALLOWED_PORTS", "80, 8443")
    assert egress.allowed_ports_from_env() == {80, 8443}


async def test_proxy_forwards_connect_to_public(stub, monkeypatch):
    stub_port, _ = stub
    allow_loopback_for_public_name(monkeypatch, stub_port)
    server, proxy = await open_proxy_allowing(stub_port)
    reader, writer = await asyncio.open_connection("127.0.0.1", proxy)
    writer.write(f"CONNECT public.example:{stub_port} HTTP/1.1\r\n\r\n".encode())
    await writer.drain()
    head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 5)
    assert head.startswith(b"HTTP/1.1 200")
    writer.write(b"ping")
    await writer.drain()
    assert await asyncio.wait_for(reader.read(100), 5) == b"echo:ping"
    writer.close()
    server.close()


async def test_proxy_forwards_plain_http_to_public(stub, monkeypatch):
    stub_port, received = stub
    allow_loopback_for_public_name(monkeypatch, stub_port)
    server, proxy = await open_proxy_allowing(stub_port)
    req = f"GET http://public.example:{stub_port}/a?b=1 HTTP/1.1\r\nHost: public.example:{stub_port}\r\nProxy-Connection: keep-alive\r\n\r\n"
    resp = await roundtrip(proxy, req.encode())
    server.close()
    assert resp.startswith(b"HTTP/1.1 200") and resp.endswith(b"hello")
    # origin sees origin-form request line, not the absolute URI
    assert received[0].startswith(b"GET /a?b=1 HTTP/1.1\r\n")
    assert b"Proxy-Connection" not in received[0]
