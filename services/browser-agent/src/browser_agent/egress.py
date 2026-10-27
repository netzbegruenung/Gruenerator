"""Filternder Egress-Proxy: der Browser darf nur ins öffentliche Netz.

Chromium wird per ``--proxy-server`` durch diesen Proxy gezwungen. Im Betrieb
läuft er im Container ``browser-gateway`` (``gateway.py``) zwischen einem
Docker-Netz ohne Ausgang, in dem der Browser hängt, und dem Internet; lokal
startet ``api.py`` ihn im selben Prozess. Er löst DNS selbst auf, prüft **jede** aufgelöste Adresse und
verbindet dann zur geprüften IP (nicht noch einmal zum Namen), damit ein
zweiter, abweichender DNS-Lookup (Rebinding) nichts ändern kann.
"""

import asyncio
import ipaddress
import os
import socket
from urllib.parse import urlsplit

# Stand von `isPrivateAddress` (apps/api, PR #5011), dazu 6to4 und Teredo: beide
# tragen eine IPv4 in der Adresse (6to4 auch eine private), und öffentliche Ziele
# erreicht man über sie nicht direkt — ganz sperren ist billiger als auspacken.
_BLOCKED = [
    ipaddress.ip_network(n)
    for n in (
        "0.0.0.0/8",
        "10.0.0.0/8",
        "100.64.0.0/10",
        "127.0.0.0/8",
        "169.254.0.0/16",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "224.0.0.0/3",
        "::/96",
        "2001::/32",
        "2002::/16",
        "fc00::/7",
        "fe80::/10",
        "fec0::/10",
        "ff00::/8",
    )
]

_NAT64 = ipaddress.ip_network("64:ff9b::/96")
_DEFAULT_PORTS = frozenset({80, 443})
_MAX_HEAD = 64 * 1024
_HEAD_TIMEOUT = 15
_CONNECT_TIMEOUT = 15
_PLAIN_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}


def parse_extra_blocked(value: str) -> list:
    """Kommagetrennte IPs/CIDRs (Env ``BROWSER_EGRESS_EXTRA_BLOCKED``)."""
    return [ipaddress.ip_network(p.strip(), strict=False) for p in value.split(",") if p.strip()]


def allowed_ports_from_env() -> frozenset:
    """Erlaubte Zielports (Env ``BROWSER_EGRESS_ALLOWED_PORTS``, Standard 80,443)."""
    raw = os.environ.get("BROWSER_EGRESS_ALLOWED_PORTS", "")
    ports = frozenset(int(p) for p in raw.split(",") if p.strip())
    return ports or _DEFAULT_PORTS


def extra_blocked_from_env() -> list:
    return parse_extra_blocked(os.environ.get("BROWSER_EGRESS_EXTRA_BLOCKED", ""))


def is_blocked(ip: str, extra: list) -> bool:
    """True, wenn ``ip`` nicht erreichbar sein darf. Unlesbares gilt als gesperrt."""
    try:
        addr = ipaddress.ip_address(ip.split("%", 1)[0])
    except ValueError:
        return True
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        addr = addr.ipv4_mapped
    elif addr in _NAT64:
        # NAT64 trägt eine IPv4 im unteren Wort; beurteilt wird diese.
        addr = ipaddress.IPv4Address(int(addr) & 0xFFFFFFFF)
    return any(addr in net for net in (*_BLOCKED, *extra) if net.version == addr.version)


def _respond(status: str) -> bytes:
    return f"HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".encode()


class _Refused(Exception):
    def __init__(self, status: str):
        self.status = status


def _split_host_port(authority: str, default_port: int) -> tuple[str, int]:
    if authority.startswith("["):
        host, _, rest = authority[1:].partition("]")
        port = rest[1:] if rest.startswith(":") else ""
    else:
        host, _, port = authority.rpartition(":") if ":" in authority else (authority, "", "")
    if not host:
        raise _Refused("400 Bad Request")
    try:
        return host, int(port) if port else default_port
    except ValueError:
        raise _Refused("400 Bad Request") from None


async def _open_checked(host: str, port: int, extra: list):
    """Auflösen, alle Adressen prüfen, zur geprüften IP verbinden."""
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError:
        raise _Refused("502 Bad Gateway") from None
    ips = [info[4][0] for info in infos]
    if not ips:
        raise _Refused("502 Bad Gateway")
    if any(is_blocked(ip, extra) for ip in ips):
        raise _Refused("403 Forbidden")
    for ip in ips:
        try:
            return await asyncio.wait_for(asyncio.open_connection(ip, port), _CONNECT_TIMEOUT)
        except (OSError, TimeoutError):
            continue
    raise _Refused("502 Bad Gateway")


async def _pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while data := await reader.read(65536):
            writer.write(data)
            await writer.drain()
    except (OSError, asyncio.CancelledError):
        pass
    finally:
        try:
            writer.close()
        except OSError:
            pass


async def _tunnel(r1, w1, r2, w2) -> None:
    await asyncio.gather(_pipe(r1, w2), _pipe(r2, w1))


async def _handle(
    reader: asyncio.StreamReader, writer: asyncio.StreamWriter, extra: list, ports: frozenset
) -> None:
    upstream_writer = None
    try:
        try:
            head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), _HEAD_TIMEOUT)
        except (asyncio.IncompleteReadError, asyncio.LimitOverrunError, TimeoutError):
            raise _Refused("400 Bad Request") from None
        if len(head) > _MAX_HEAD:
            raise _Refused("431 Request Header Fields Too Large")
        lines = head[:-4].decode("latin-1").split("\r\n")
        parts = lines[0].split(" ")
        if len(parts) != 3:
            raise _Refused("400 Bad Request")
        method, target, version = parts

        if method == "CONNECT":
            host, port = _split_host_port(target, 443)
            if port not in ports:
                raise _Refused("403 Forbidden")
            up_r, upstream_writer = await _open_checked(host, port, extra)
            writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            await writer.drain()
            await _tunnel(reader, writer, up_r, upstream_writer)
            return

        if method not in _PLAIN_METHODS:
            raise _Refused("405 Method Not Allowed")
        url = urlsplit(target)
        if url.scheme != "http" or not url.hostname:
            raise _Refused("405 Method Not Allowed")
        host, port = _split_host_port(url.netloc.rpartition("@")[2], 80)
        if port not in ports:
            raise _Refused("403 Forbidden")
        up_r, upstream_writer = await _open_checked(host, port, extra)
        path = (url.path or "/") + (f"?{url.query}" if url.query else "")
        headers = [
            h for h in lines[1:]
            if h.split(":", 1)[0].strip().lower() not in ("proxy-connection", "proxy-authorization", "connection")
        ]
        out = "\r\n".join([f"{method} {path} {version}", *headers, "Connection: close", "", ""])
        upstream_writer.write(out.encode("latin-1"))
        await upstream_writer.drain()
        await _tunnel(reader, writer, up_r, upstream_writer)
    except _Refused as e:
        writer.write(_respond(e.status))
        try:
            await writer.drain()
        except OSError:
            pass
    except OSError:
        pass
    finally:
        for w in (writer, upstream_writer):
            if w is not None:
                try:
                    w.close()
                except OSError:
                    pass


async def start_egress_proxy(
    host: str, port: int, extra_blocked: list[str], allowed_ports: frozenset | None = None
) -> asyncio.AbstractServer:
    """Startet den Proxy. ``port=0`` wählt einen freien Port (``server.sockets``)."""
    extra = parse_extra_blocked(",".join(extra_blocked))
    ports = frozenset(allowed_ports) if allowed_ports is not None else allowed_ports_from_env()
    return await asyncio.start_server(lambda r, w: _handle(r, w, extra, ports), host, port)

