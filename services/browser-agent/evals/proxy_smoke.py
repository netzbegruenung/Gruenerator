"""Rauchtest: Chromium mit den Argumenten aus run.py hinter dem Egress-Proxy.

Läuft im Container (`docker exec <id> python /app/evals/proxy_smoke.py`) oder
lokal mit PYTHONPATH=src. Erwartung: Metadaten-Adresse und Loopback sind
gesperrt, example.org lädt. Exit-Code 1, wenn eine Erwartung nicht stimmt.
"""

import asyncio
import sys
import tempfile
from pathlib import Path

from browser_use import BrowserSession

from browser_agent.api import PROXY_HOST, PROXY_PORT
from browser_agent.egress import start_egress_proxy
from browser_agent.run import build_profile

CASES = [
    ("http://169.254.169.254/", False),
    ("http://127.0.0.1:8000/health", False),
    ("https://example.org", True),
]


async def main() -> int:
    # Läuft der Dienst schon (docker exec), belegt er den Proxy-Port: dann den vorhandenen nutzen.
    try:
        server = await start_egress_proxy(PROXY_HOST, PROXY_PORT, [])
    except OSError:
        server = None
    workdir = Path(tempfile.mkdtemp(prefix="smoke-"))
    session = BrowserSession(browser_profile=build_profile(workdir))
    failed = False
    try:
        await session.start()
        for url, should_load in CASES:
            try:
                await session.navigate_to(url)
                # Der von browser-use gepflegte Titel hinkt nach; document.title direkt fragen.
                title = ""
                for _ in range(20):
                    await asyncio.sleep(0.5)
                    cdp = await session.get_or_create_cdp_session()
                    r = await cdp.cdp_client.send.Runtime.evaluate(
                        params={"expression": "document.title", "returnByValue": True},
                        session_id=cdp.session_id,
                    )
                    title = r["result"].get("value", "")
                    if title == "Example Domain":
                        break
                final = await session.get_current_page_url()
            except Exception as e:
                title, final = f"<error: {type(e).__name__}: {e}>", ""
            loaded = title == "Example Domain"
            ok = loaded == should_load
            failed |= not ok
            print(f"{'OK  ' if ok else 'FAIL'} {url} -> url={final!r} title={title!r}")
    finally:
        await session.kill()
        if server is not None:
            server.close()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
