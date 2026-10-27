"""Rauchtest: Chromium mit dem Profil aus run.py hinter dem Egress-Proxy.

Läuft in einem frischen Container des Images (der Proxy-Port 8899 muss frei sein):

    docker run --rm -v "$PWD/services/browser-agent/evals:/evals" \\
        gruenerator-browser-agent python /evals/proxy_smoke.py

Ein „gesperrt“ zählt nur, wenn der Fall ohne Sperre geladen HÄTTE:

- example.org lädt in Phase A (ohne Zusatzsperre) und darf in Phase B nicht
  laden, nachdem seine zur Laufzeit aufgelösten Adressen in die Zusatzsperre
  des Proxys gelegt wurden; example.com lädt in beiden Phasen.
- Ein lokaler Server auf 127.0.0.1 zählt seine Abrufe. Er muss bei 0 bleiben —
  direkt angesteuert und als Ziel einer Weiterleitung.
- Die Weiterleitung kommt von einem zweiten lokalen Server auf 127.0.0.2, den
  NUR dieser Test als „öffentlich“ durchlässt (die eine Ausnahme in
  `is_blocked`). Damit läuft der zweite Sprung als eigene Anfrage durch die
  Prüfung des Proxys, ohne einen fremden Weiterleitungsdienst.
- Private Literale (169.254.169.254, [::1], [fd00::1]) muss der Proxy selbst
  abweisen (`is_blocked` hat für sie True geliefert).
- file://localhost/etc/hosts lädt nicht über `navigate`, und die Chromium-Policy
  sperrt file:// auch beim direkten CDP-Navigieren („policy“). Gemessen
  27.10.2026 (browser-use 0.13.14): `allowed_domains` allein verhindert das
  Laden NICHT — der Navigations-Handler der Session läuft vor dem Wächter, der
  setzt die Seite erst danach auf about:blank zurück. Die Policy ist die Sperre,
  `allowed_domains` der Rückfall.

Exit-Code 1, wenn eine Erwartung nicht stimmt.
"""

import asyncio
import socket
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from browser_use import BrowserSession

from browser_agent import egress
from browser_agent.api import PROXY_HOST, PROXY_PORT
from browser_agent.run import build_profile

EXAMPLE_TITLE = "Example Domain"
INTERNAL_TITLE = "INTERNAL-SECRET"
STAND_IN_PUBLIC_IP = "127.0.0.2"

internal_hits = 0
proxy_verdicts: list[tuple[str, bool]] = []


class _Internal(BaseHTTPRequestHandler):
    def do_GET(self):
        global internal_hits
        internal_hits += 1
        body = f"<html><head><title>{INTERNAL_TITLE}</title></head><body>secret</body></html>".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def _redirect_handler(target: str):
    class _Redirect(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(302)
            self.send_header("Location", target)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, *args):
            pass

    return _Redirect


def _serve(host: str, handler) -> ThreadingHTTPServer:
    srv = ThreadingHTTPServer((host, 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def _resolve(host: str) -> set[str]:
    return {info[4][0] for info in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}


_real_is_blocked = egress.is_blocked


def _recording_is_blocked(ip: str, extra: list) -> bool:
    blocked = False if ip == STAND_IN_PUBLIC_IP else _real_is_blocked(ip, extra)
    proxy_verdicts.append((ip, blocked))
    return blocked


async def _stop_proxy(server: asyncio.AbstractServer) -> None:
    server.close()
    server.close_clients()
    await server.wait_closed()


async def _title(session: BrowserSession, want: str) -> str:
    title = ""
    for _ in range(16):
        await asyncio.sleep(0.5)
        cdp = await session.get_or_create_cdp_session()
        r = await cdp.cdp_client.send.Runtime.evaluate(
            params={"expression": "document.title", "returnByValue": True},
            session_id=cdp.session_id,
        )
        title = r["result"].get("value", "")
        if title == want:
            break
    return title


async def _visit(session: BrowserSession, url: str, want: str) -> tuple[bool, str]:
    try:
        await session.navigate_to(url)
        title = await _title(session, want)
        final = await session.get_current_page_url()
    except Exception as e:
        return False, f"<refused: {type(e).__name__}: {str(e)[:80]}>"
    return title == want, f"url={final!r} title={title!r}"


async def _cdp_reads_file(session: BrowserSession) -> tuple[bool, str]:
    """Am browser-use-Wächter vorbei direkt per CDP: hält die Chromium-Policy?"""
    cdp = await session.get_or_create_cdp_session()
    await cdp.cdp_client.send.Page.navigate(params={"url": "file:///etc/hosts"}, session_id=cdp.session_id)
    await asyncio.sleep(2)
    r = await cdp.cdp_client.send.Runtime.evaluate(
        params={
            "expression": "location.href + ' | ' + (document.body ? document.body.innerText : '')",
            "returnByValue": True,
        },
        session_id=cdp.session_id,
    )
    text = r["result"].get("value", "")
    return "localhost" in text.split(" | ", 1)[-1], repr(text[:100])


async def _session(tag: str) -> BrowserSession:
    session = BrowserSession(browser_profile=build_profile(Path(tempfile.mkdtemp(prefix=f"smoke-{tag}-"))))
    await session.start()
    return session


async def main() -> int:
    egress.is_blocked = _recording_is_blocked
    internal = _serve("127.0.0.1", _Internal)
    internal_url = f"http://127.0.0.1:{internal.server_port}/"
    redirector = _serve(STAND_IN_PUBLIC_IP, _redirect_handler(internal_url))
    redirect_url = f"http://{STAND_IN_PUBLIC_IP}:{redirector.server_port}/go"
    # Die Testports freigeben, damit allein die Adresse über die Sperre entscheidet.
    ports = frozenset({80, 443, internal.server_port, redirector.server_port})

    org_ips = _resolve("example.org")
    com_ips = _resolve("example.com")
    if org_ips & com_ips:
        print(f"SETUP example.org und example.com teilen Adressen ({org_ips & com_ips}); Negativfall nicht trennbar")
        return 1

    failed = False

    def report(ok: bool, label: str, detail: str) -> None:
        nonlocal failed
        failed |= not ok
        print(f"{'OK  ' if ok else 'FAIL'} {label}: {detail}", flush=True)

    # Phase A: ohne Zusatzsperre — der Gegenbeweis, dass example.org laden WÜRDE.
    try:
        server = await egress.start_egress_proxy(PROXY_HOST, PROXY_PORT, [], ports)
    except OSError as e:
        print(f"SETUP Proxy-Port {PROXY_PORT} belegt ({e}); in einem frischen Container starten")
        return 1
    session = await _session("a")
    try:
        loaded, detail = await _visit(session, "https://example.org", EXAMPLE_TITLE)
        report(loaded, "A example.org loads without the extra block", detail)
        loaded, detail = await _visit(session, "https://example.com", EXAMPLE_TITLE)
        report(loaded, "A example.com loads", detail)
    finally:
        await session.kill()
        await _stop_proxy(server)

    # Phase B: example.orgs Adressen gesperrt; frischer Browser, damit kein Tunnel aus A weiterlebt.
    server = await egress.start_egress_proxy(PROXY_HOST, PROXY_PORT, sorted(org_ips), ports)
    session = await _session("b")
    try:
        loaded, detail = await _visit(session, "https://example.com", EXAMPLE_TITLE)
        report(loaded, "B example.com still loads", detail)

        mark = len(proxy_verdicts)
        loaded, detail = await _visit(session, "https://example.org", EXAMPLE_TITLE)
        refused = any(ip in org_ips and blocked for ip, blocked in proxy_verdicts[mark:])
        report(not loaded and refused, "B example.org blocked by the extra list", f"{detail} proxy_refused={refused}")

        for url, ip in (
            ("http://169.254.169.254/latest/meta-data/", "169.254.169.254"),
            ("http://[::1]/", "::1"),
            ("http://[fd00::1]/", "fd00::1"),
        ):
            mark = len(proxy_verdicts)
            loaded, detail = await _visit(session, url, EXAMPLE_TITLE)
            refused = (ip, True) in proxy_verdicts[mark:]
            report(not loaded and refused, f"B {url} refused by the proxy", f"{detail} proxy_refused={refused}")

        mark = len(proxy_verdicts)
        loaded, detail = await _visit(session, internal_url, INTERNAL_TITLE)
        refused = ("127.0.0.1", True) in proxy_verdicts[mark:]
        report(
            not loaded and refused and internal_hits == 0,
            "B loopback service unreachable",
            f"{detail} proxy_refused={refused} hits={internal_hits}",
        )

        mark = len(proxy_verdicts)
        loaded, detail = await _visit(session, redirect_url, INTERNAL_TITLE)
        first_hop = (STAND_IN_PUBLIC_IP, False) in proxy_verdicts[mark:]
        second_hop_refused = ("127.0.0.1", True) in proxy_verdicts[mark:]
        report(
            not loaded and first_hop and second_hop_refused and internal_hits == 0,
            "B redirect to loopback refused on the second hop",
            f"{detail} first_hop_allowed={first_hop} second_hop_refused={second_hop_refused} hits={internal_hits}",
        )

        loaded, detail = await _visit(session, "file://localhost/etc/hosts", "localhost")
        report(not loaded and "refused" in detail, "B file://localhost/etc/hosts refused on navigate", detail)

        read, detail = await _cdp_reads_file(session)
        report(not read, "B policy: file:///etc/hosts blocked even via raw CDP", detail)
    finally:
        await session.kill()
        await _stop_proxy(server)
        internal.shutdown()
        redirector.shutdown()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
