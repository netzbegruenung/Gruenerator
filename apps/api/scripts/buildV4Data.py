#!/usr/bin/env python3
"""
Build the v4 training set — intelligently.

v3's mistake: dropping masculine-generic docs removed the quote-rich PMs (avg 3.1 quotes/doc
vs 1.3 kept) → lost structure. v4 instead KEEPS those PMs and gender-normalizes them with an
LLM (Mistral), which handles German gendering correctly where regex mangles it. Result:
structure-rich AND gendered data, artifacts stripped.

  --sample N   normalize only N docs and print before/after (validation gate, no full write)
  (no args)    full build → data/de-v4/

Run from apps/api/.
"""

import json
import os
import re
import sys
import time
from pathlib import Path

import httpx

import evalGemma4 as ev  # reuse clean_text-style helpers via cleanTrainingData
import cleanTrainingData as ct

SRC = Path("data/de")
DST = Path("data/de-v4")

NORMALIZE_PROMPT = (
    "Formuliere den folgenden Text in gendergerechte Sprache mit Genderstern um "
    "(z. B. 'die Bürger' → 'die Bürger*innen', 'Wählerinnen und Wähler' → 'Wähler*innen'). "
    "Ändere AUSSCHLIESSLICH die Personenbezeichnungen — Inhalt, Struktur, Zitate, Namen, Zahlen "
    "und Formatierung bleiben exakt gleich. Gib nur den umformulierten Text zurück, ohne Kommentar."
)


def mistral_normalize(text: str) -> str:
    """Gender-normalize via Mistral. On persistent failure, return the original text
    unchanged (keep the structure-rich doc rather than crash the whole build)."""
    for attempt in range(4):
        try:
            resp = httpx.post(
                "https://api.mistral.ai/v1/chat/completions",
                headers={"Authorization": f"Bearer {os.environ['MISTRAL_API_KEY']}"},
                json={
                    "model": "mistral-large-latest",
                    "messages": [
                        {"role": "system", "content": NORMALIZE_PROMPT},
                        {"role": "user", "content": text},
                    ],
                    "temperature": 0.1,
                },
                timeout=300,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
        except Exception as exc:  # noqa: BLE001
            if attempt == 3:
                print(f"    normalize failed ({type(exc).__name__}); keeping doc as-is")
                return text
            time.sleep(5)
    return text


def process(path: Path, sample: int | None):
    kept, stats = [], {"in": 0, "short": 0, "normalized": 0, "kept_asis": 0}
    normalized_done = 0
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        stats["in"] += 1
        obj = json.loads(line)
        msgs = obj["messages"]
        i = next(k for k, m in enumerate(msgs) if m["role"] == "assistant")
        cleaned = ct.clean_text(msgs[i]["content"])  # strip date/url/nav artifacts (no dropping)
        if len(cleaned) < ct.MIN_LEN:
            stats["short"] += 1
            continue

        if ct.UNGENDERED.search(cleaned):
            if sample is not None and normalized_done >= sample:
                continue
            normalized = mistral_normalize(cleaned)
            normalized_done += 1
            stats["normalized"] += 1
            if sample is not None:
                print(f"\n--- BEFORE (#{normalized_done}) ---\n{cleaned[:400]}")
                print(f"--- AFTER ---\n{normalized[:400]}")
            msgs[i]["content"] = normalized
            time.sleep(0.3)
        else:
            stats["kept_asis"] += 1
            msgs[i]["content"] = cleaned
        kept.append(obj)
        if sample is not None and normalized_done >= sample:
            break
    return kept, stats


def main() -> None:
    ev.load_env()
    sample = None
    if len(sys.argv) > 2 and sys.argv[1] == "--sample":
        sample = int(sys.argv[2])

    for name in ("training-data.jsonl", "validation-data.jsonl"):
        src = SRC / name
        if not src.exists():
            continue
        kept, stats = process(src, sample)
        print(f"\n{name}: {stats}")
        if sample is None:
            DST.mkdir(parents=True, exist_ok=True)
            (DST / name).write_text("\n".join(json.dumps(o, ensure_ascii=False) for o in kept) + "\n")
            print(f"  → {DST / name} ({len(kept)} docs)")
        else:
            break  # sample mode: only the training file, only N docs


if __name__ == "__main__":
    main()
