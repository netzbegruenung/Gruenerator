"""Manuelle Aufgaben-Matrix gegen einen laufenden Browser-Agent (nicht in der CI).

    BROWSER_AGENT_URL=http://localhost:8000 BROWSER_AGENT_SECRET=... \\
    LLM_BASE_URL=https://.../v1 LLM_TOKEN=... python evals/run_matrix.py [--runs 2]

Druckt je Lauf: Sekunden, Schritte, Anzahl PNGs in `done.saved`, `timed_out`
und ob ein Klick auf einen Ablehnen-Knopf („Alles ablehnen“ o. ä.) vorkam.
"""

import argparse
import json
import os
import re
import sys
import uuid

import httpx

TASKS = [
    (
        "gruene.de",
        "https://www.gruene.de",
        "Erkunde die Website und fasse zusammen, welche Themen und Bereiche sie bietet. "
        "Mache mindestens zwei Screenshots (Aktion screenshot mit file_name).",
    ),
    (
        "stadt-muenster.de",
        "https://www.stadt-muenster.de",
        "Lehne das Cookie-Banner ab, öffne die Seite zum Thema Klimaschutz und mache zwei Screenshots "
        "(Aktion screenshot mit file_name).",
    ),
    (
        "bonn ratsinfo",
        "https://www.bonn.sitzung-online.de/public/",
        'Suche im Ratsinformationssystem nach "Radverkehr", öffne einen Treffer und mache zwei Screenshots '
        "(Aktion screenshot mit file_name).",
    ),
]

REJECT_RE = re.compile(r"ablehn|nur notwendige|reject|decline|deny", re.IGNORECASE)


def run_once(url: str, secret: str, llm_base_url: str, llm_token: str, start_url: str, task: str) -> dict:
    body = {
        "run_id": str(uuid.uuid4()),
        "task": task,
        "start_url": start_url,
        "llm_base_url": llm_base_url,
        "llm_token": llm_token,
        "max_steps": 25,
    }
    reject_click = False
    done: dict = {}
    error = ""
    with httpx.stream(
        "POST",
        f"{url}/runs",
        json=body,
        headers={"X-Browser-Agent-Secret": secret},
        timeout=httpx.Timeout(200.0, connect=10.0),
    ) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines():
            if not line.strip():
                continue
            event = json.loads(line)
            if event["type"] == "step" and event.get("action") == "click" and REJECT_RE.search(event.get("target") or ""):
                reject_click = True
            elif event["type"] == "done":
                done = event
            elif event["type"] == "error":
                error = event["message"]
    return {"done": done, "error": error, "reject_click": reject_click}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=os.environ.get("BROWSER_AGENT_URL", "http://localhost:8000"))
    parser.add_argument("--secret", default=os.environ.get("BROWSER_AGENT_SECRET", ""))
    parser.add_argument("--llm-base-url", default=os.environ.get("LLM_BASE_URL", ""))
    parser.add_argument("--llm-token", default=os.environ.get("LLM_TOKEN", ""))
    parser.add_argument("--runs", type=int, default=2)
    args = parser.parse_args()
    if not (args.secret and args.llm_base_url and args.llm_token):
        print("BROWSER_AGENT_SECRET, LLM_BASE_URL und LLM_TOKEN (oder die Argumente) sind nötig.", file=sys.stderr)
        return 2

    print(f"{'aufgabe':<20} {'lauf':>4} {'sek':>6} {'schritte':>8} {'pngs':>4} {'timed_out':>9} {'ablehnen':>8}")
    for name, start_url, task in TASKS:
        for i in range(1, args.runs + 1):
            r = run_once(args.url, args.secret, args.llm_base_url, args.llm_token, start_url, task)
            if r["error"]:
                print(f"{name:<20} {i:>4} ERROR: {r['error']}")
                continue
            d = r["done"]
            print(
                f"{name:<20} {i:>4} {d.get('seconds', 0):>6} {d.get('steps', 0):>8} {len(d.get('saved', [])):>4} "
                f"{str(d.get('timed_out')):>9} {'ja' if r['reject_click'] else 'nein':>8}"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
