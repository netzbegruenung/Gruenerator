#!/usr/bin/env python3
"""
Post-process the DE training set into a clean v3 dataset.

The v2 fine-tune failed on Genderstern + polish because its training data was
contaminated: ~25% scraper junk (date prefixes, URLs, navigation) and 18% used
masculine-generic plurals (Bürger, not Bürger*innen) that taught the model to
DROP gendering — directly contradicting the system prompt.

This salvages edge-dirty docs by stripping artifacts, and drops docs that teach
the wrong behavior or are too short. Reads the already-transformed JSONL (no
Qdrant re-export needed); writes data/de-clean/.

Usage (from apps/api/):
    scripts/.venv/bin/python scripts/cleanTrainingData.py
"""

import json
import re
from pathlib import Path

SRC = Path("data/de")
DST = Path("data/de-clean")
MIN_LEN = 300

# Masculine-generic plurals that should be gendered but aren't → teaches wrong behavior.
GENERICS = (
    r"(Bürger|Wähler|Politiker|Mitarbeiter|Kolleg|Schüler|Lehrer|Arbeiter|Verbraucher|Nutzer|"
    r"Teilnehmer|Vertreter|Wissenschaftler|Aktivist|Einwohner|Pendler|Bewohner|Unternehmer|"
    r"Experten|Sprecher|Helfer|Unterstützer|Anhänger)"
)
UNGENDERED = re.compile(r"\b" + GENERICS + r"(n|innen)?\b(?![*:])", re.IGNORECASE)

DATE_PREFIX = re.compile(r"^\s*(Veröffentlicht\s+am[^\n]*|Stand:[^\n]*|\d{1,2}\.\d{1,2}\.\d{4})\s*", re.IGNORECASE)
URL_OR_NAV = re.compile(
    r"(https?://|www\.|[a-zäöü]\.de[A-ZÄÖÜ]|gruene\.de\b|Zum Inhalt springen|Tagesordnung|"
    r"Youtube-Playlist|Instagram-Kanal|Newsletter abonnier|Cookie|Datenschutzerklärung|Mehr erfahren)",
    re.IGNORECASE,
)


def clean_text(text: str) -> str:
    """Strip a leading date/meta prefix and drop URL/navigation lines."""
    text = DATE_PREFIX.sub("", text, count=1)
    kept = [ln for ln in text.splitlines() if not URL_OR_NAV.search(ln)]
    cleaned = "\n".join(kept)
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


def process(path: Path) -> tuple[list, dict]:
    kept, stats = [], {"in": 0, "dropped_short": 0, "dropped_ungendered": 0, "dropped_still_dirty": 0}
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        stats["in"] += 1
        obj = json.loads(line)
        msgs = obj["messages"]
        a_idx = next(i for i, m in enumerate(msgs) if m["role"] == "assistant")
        cleaned = clean_text(msgs[a_idx]["content"])

        if len(cleaned) < MIN_LEN:
            stats["dropped_short"] += 1
            continue
        if UNGENDERED.search(cleaned):
            stats["dropped_ungendered"] += 1
            continue
        if URL_OR_NAV.search(cleaned) or DATE_PREFIX.match(cleaned):
            stats["dropped_still_dirty"] += 1
            continue

        msgs[a_idx]["content"] = cleaned
        kept.append(obj)
    return kept, stats


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    for name in ("training-data.jsonl", "validation-data.jsonl"):
        src = SRC / name
        if not src.exists():
            print(f"skip {src} (missing)")
            continue
        kept, stats = process(src)
        (DST / name).write_text("\n".join(json.dumps(o, ensure_ascii=False) for o in kept) + "\n")
        print(
            f"{name}: {stats['in']} → {len(kept)} kept "
            f"(short {stats['dropped_short']}, ungendered {stats['dropped_ungendered']}, "
            f"still-dirty {stats['dropped_still_dirty']}) → {DST / name}"
        )


if __name__ == "__main__":
    main()
