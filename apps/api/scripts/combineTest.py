#!/usr/bin/env python3
"""
Test the COMBINATION: v2 fine-tune + anti-preamble/Genderstern prompt.

Hypothesis: the fine-tune supplies authentic Grüne PM *structure/voice* (learned from
real examples, un-promptable), the prompt supplies directness + Genderstern (instructable).
If they compose, v2+prompt should match real-PM structure better than base+prompt while
also being direct and gendered.

Evaluated the RIGHT way for structure/voice — reference-based against REAL training PMs
(an LLM judge can't assess authentic house style) — plus directness + a judge pass.

Cost: one v2 dedicated-endpoint spin (~$2, ~15 min). Run from apps/api/.
"""

import json
import re
import sys
import time
from pathlib import Path

from together import Together

import evalGemma4 as ev
from promptFixTest import AUG_SYSTEM, PREAMBLE

# Model under test (the fine-tune to combine with the prompt). Defaults to v2; pass v3 as argv[1].
MODEL = sys.argv[1] if len(sys.argv) > 1 else ev.V2_MODEL
TAG = MODEL.split("/")[-1][:24]

REPORT = Path(f"data/eval/combine-{TAG}-report.md")
OUT = Path(f"data/eval/combine-{TAG}-generations.json")

# Structural markers of an authentic Grüne PM (derived from the reference PM in training data).
FUNKTION = re.compile(
    r"(Sprecher\*?in|Sprecher|Vorsitzende|Fraktionsvorsitzende|Abgeordnete|Landtagsabgeordnete|"
    r"Bundestagsabgeordnete|Stadtrat|Stadträtin|Ministerin?|Senator)", re.I)
CORP = re.compile(r"PRESSEMITTEILUNG|\[ORT\]|\[DATUM\]|\[NAME\]|\[Datum\]")


def markers(texts: list[str]) -> dict:
    n = len(texts)
    return {
        "quote_density (avg „ per doc)": round(sum(t.count("„") for t in texts) / n, 1),
        "Funktion-attribution present": f"{sum(1 for t in texts if FUNKTION.search(t))}/{n}",
        "generic corporate template": f"{sum(1 for t in texts if CORP.search(t))}/{n}",
        "meta-preamble": f"{sum(1 for t in texts if PREAMBLE.match(t.strip()))}/{n}",
        "Genderstern total": sum(len(ev.GENDERSTERN_RE.findall(t)) for t in texts),
    }


def generate_v2_with_prompt(client: Together) -> dict:
    ep = ev.create_endpoint(client, MODEL)  # leak-proof: self-deletes on failure
    outs = {}
    try:
        for i, p in enumerate(ev.PROMPTS, 1):
            print(f"  [v2+prompt {i}/{len(ev.PROMPTS)}] {p['id']}")
            for attempt in range(5):
                try:
                    r = client.chat.completions.create(
                        model=ep.name,
                        messages=[{"role": "system", "content": AUG_SYSTEM},
                                  {"role": "user", "content": p["user_prompt"]}],
                        temperature=0.3, max_tokens=ev.GEN_MAX_TOKENS,
                    )
                    outs[p["id"]] = {"type": p["type"], "user_prompt": p["user_prompt"],
                                     "text": r.choices[0].message.content or ""}
                    break
                except Exception as exc:  # noqa: BLE001
                    if attempt == 4:
                        outs[p["id"]] = {"type": p["type"], "user_prompt": p["user_prompt"],
                                         "text": f"[FAILED: {type(exc).__name__}]"}
                    else:
                        time.sleep(8)
    finally:
        try:
            client.endpoints.delete(ep.id)
            print(f"  Deleted endpoint {ep.id}")
        except Exception as exc:  # noqa: BLE001
            print(f"  WARNING: could not delete {ep.id}: {exc} — CHECK DASHBOARD")
    OUT.write_text(json.dumps(outs, ensure_ascii=False, indent=2))
    return outs


def real_pm_reference() -> list[str]:
    real = []
    for line in Path("data/de/training-data.jsonl").read_text().splitlines():
        if not line.strip():
            continue
        m = json.loads(line)["messages"]
        u = next(x["content"] for x in m if x["role"] == "user")
        a = next(x["content"] for x in m if x["role"] == "assistant")
        if ("Presse" in u or "Pressemitteilung" in u) and len(a) > 600:
            real.append(a)
    return real


def main() -> None:
    ev.load_env()
    client = Together(timeout=600.0, max_retries=4)

    print("Generating v2 + anti-preamble prompt...")
    v2p = generate_v2_with_prompt(client)
    v2p_texts = [d["text"] for d in v2p.values()]
    basep = [d["text"] for d in json.loads(Path("data/eval/base-promptfix-generations.json").read_text()).values()]
    real = real_pm_reference()

    print(f"\n=== Reference-based structure (target = REAL PMs, n={len(real)}) ===")
    groups = {"REAL PMs (target)": real, "base+prompt": basep, "v2+prompt": v2p_texts}
    for name, texts in groups.items():
        print(f"\n  {name}:")
        for k, v in markers(texts).items():
            print(f"    {k}: {v}")

    # Judge v2+prompt vs base+prompt (note: LLM judge is weak on house style; directness/voice signal only)
    wins = {"v2prompt": 0, "baseprompt": 0, "tie": 0}
    for pid, d in v2p.items():
        a_dims, b_dims, winners = [], [], []
        for v2_is_a in (True, False):
            a, b = (d["text"], json.loads(Path('data/eval/base-promptfix-generations.json').read_text())[pid]["text"]) \
                if v2_is_a else (json.loads(Path('data/eval/base-promptfix-generations.json').read_text())[pid]["text"], d["text"])
            v = ev.regolo_judge(d["type"], d["user_prompt"], a, b)  # EU-sovereign judge (gpt-oss-120b)
            fs = "A" if v2_is_a else "B"
            w = v.get("winner", "tie")
            winners.append("tie" if w == "tie" else ("v2prompt" if w == fs else "baseprompt"))
        wins[winners[0] if winners[0] == winners[1] else "tie"] += 1
    print(f"\n=== Judge v2+prompt vs base+prompt (generic-quality signal only): "
          f"v2+prompt {wins['v2prompt']} | base+prompt {wins['baseprompt']} | tie {wins['tie']} ===")

    lines = ["# Combination test: v2 fine-tune + anti-preamble prompt", ""]
    for name, texts in groups.items():
        lines.append(f"**{name}**: " + ", ".join(f"{k}={v}" for k, v in markers(texts).items()))
    lines.append("")
    lines.append(f"Judge v2+prompt vs base+prompt: v2+prompt {wins['v2prompt']} / base+prompt {wins['baseprompt']} / tie {wins['tie']}")
    REPORT.write_text("\n".join(lines))
    print(f"\nReport → {REPORT}")


if __name__ == "__main__":
    main()
