#!/usr/bin/env python3
"""
Free experiment: can a prompt tweak fix base Gemma 4's only weakness (directness)?

base's eval gap was meta-preambles ("Hier ist ein Entwurf…") in 10/12 outputs — its
one low dimension. This regenerates base with an anti-preamble system prompt and judges
it head-to-head against the saved v2 fine-tune (same Mistral 6-dim blind rubric). If
base+prompt wins, fine-tuning is unnecessary — base is serverless (no GPU bill).

Cheap: ~12 serverless base calls + judging. No dedicated endpoint, no training.

Usage (from apps/api/):
    scripts/.venv/bin/python scripts/promptFixTest.py
"""

import json
import os
import re
from pathlib import Path

from together import Together

import evalGemma4 as ev  # reuse PROMPTS, judge, helpers — same rubric as the v2 verdict

ANTI_PREAMBLE = (
    "\n\nWICHTIG: Gib ausschließlich den fertigen, veröffentlichungsreifen Text aus — "
    "ohne Einleitung, ohne Meta-Kommentar und ohne Anrede an die Nutzer*in. Beginne direkt "
    "mit dem Text. Verwende durchgängig gendergerechte Sprache mit Genderstern (z. B. Bürger*innen)."
)
AUG_SYSTEM = ev.SYSTEM_PROMPT_DE + ANTI_PREAMBLE

PREAMBLE = re.compile(r"^(Hier ist|Als Kommunikat|Ich habe|Gerne|Natürlich|Hier kommt|Klar,|Hier ein)", re.I)
OUT_PATH = Path("data/eval/base-promptfix-generations.json")
REPORT_PATH = Path("data/eval/base-promptfix-report.md")


def generate_base_fixed(client: Together) -> dict:
    outs = {}
    for i, p in enumerate(ev.PROMPTS, 1):
        print(f"  [base+fix {i}/{len(ev.PROMPTS)}] {p['id']}")
        for attempt in range(5):
            try:
                r = client.chat.completions.create(
                    model=ev.BASE_MODEL,
                    messages=[{"role": "system", "content": AUG_SYSTEM},
                              {"role": "user", "content": p["user_prompt"]}],
                    temperature=0.3,
                    max_tokens=ev.GEN_MAX_TOKENS,
                )
                outs[p["id"]] = {"type": p["type"], "user_prompt": p["user_prompt"],
                                 "text": r.choices[0].message.content or ""}
                break
            except Exception as exc:  # noqa: BLE001
                if attempt == 4:
                    outs[p["id"]] = {"type": p["type"], "user_prompt": p["user_prompt"],
                                     "text": f"[FAILED: {type(exc).__name__}]"}
                else:
                    import time
                    time.sleep(8)
    OUT_PATH.write_text(json.dumps(outs, ensure_ascii=False, indent=2))
    return outs


def main() -> None:
    ev.load_env()
    client = Together(timeout=600.0, max_retries=4)

    print("Generating base WITH anti-preamble prompt (serverless)...")
    basefix = generate_base_fixed(client)

    # Programmatic directness: how many still open with a meta-preamble?
    pre = sum(1 for d in basefix.values() if PREAMBLE.match(d["text"].strip()))
    gs = sum(len(ev.GENDERSTERN_RE.findall(d["text"])) for d in basefix.values())
    print(f"\n  base+fix meta-preambles: {pre}/12 (old base was 10/12)")
    print(f"  base+fix Genderstern total: {gs} (old base 29)")

    # Judge base+fix vs the saved v2 fine-tune, same 6-dim blind rubric.
    v2gen = json.loads(ev.GENERATIONS_PATH.read_text())
    wins = {"basefix": 0, "v2": 0, "tie": 0}
    rows = []
    for pid, d in basefix.items():
        print(f"  judging {pid}")
        fix_dims, v2_dims, winners = [], [], []
        for fix_is_a in (True, False):
            a, b = (d["text"], v2gen[pid]["v2"]) if fix_is_a else (v2gen[pid]["v2"], d["text"])
            v = ev.mistral_judge(d["type"], d["user_prompt"], a, b)
            fs, vs = ("A", "B") if fix_is_a else ("B", "A")
            fix_dims.append(v[fs]); v2_dims.append(v[vs])
            w = v.get("winner", "tie")
            winners.append("tie" if w == "tie" else ("basefix" if w == fs else "v2"))
        winner = winners[0] if winners[0] == winners[1] else "tie"
        wins[winner] += 1
        md = lambda rs, k: round(sum(r[k] for r in rs) / len(rs), 2)
        rows.append((pid, winner, md(fix_dims, "directness"), md(v2_dims, "directness")))

    print(f"\n  WIN-RATE base+fix vs v2: basefix {wins['basefix']} | v2 {wins['v2']} | tie {wins['tie']}")
    lines = [
        "# base + anti-preamble prompt vs v2 fine-tune",
        f"- meta-preambles: base+fix {pre}/12 (was 10/12) · Genderstern total {gs} (was 29)",
        f"- win-rate: **base+fix {wins['basefix']} / v2 {wins['v2']} / tie {wins['tie']}**",
        "",
        "| prompt | winner | directness base+fix | directness v2 |",
        "|---|---|---|---|",
        *[f"| {p} | **{w}** | {a} | {b} |" for p, w, a, b in rows],
    ]
    REPORT_PATH.write_text("\n".join(lines))
    print(f"  Report → {REPORT_PATH}")


if __name__ == "__main__":
    main()
