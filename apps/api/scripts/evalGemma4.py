#!/usr/bin/env python3
"""
Quality-gate A/B eval — Gemma 4 v2 fine-tune vs base, judged by Mistral Large.

Three phases, each persisted so the paid phase runs at most once:
  1. GENERATE — spin a dedicated endpoint for the fine-tune, generate the prompt
                suite for both models, then DELETE the endpoint in a finally block.
  2. JUDGE    — offline; Mistral Large scores each pair blind (positions swapped).
  3. REPORT   — render a markdown report with win-rate, dimension means, excerpts.

Usage (from apps/api/):
    scripts/.venv/bin/python scripts/evalGemma4.py                # all three phases
    scripts/.venv/bin/python scripts/evalGemma4.py --judge-only   # re-judge saved generations (free)
    scripts/.venv/bin/python scripts/evalGemma4.py --report-only  # re-render report (free)
    scripts/.venv/bin/python scripts/evalGemma4.py --kill-endpoints  # safety sweep

Requires TOGETHER_API_KEY and MISTRAL_API_KEY (auto-loaded from apps/api/.env if unset).
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx
from together import Together

V2_MODEL = "moritzius007_971c/gemma-4-31B-it-gruenerator-de-gemma4-31b-v2-0fec8a6d"
BASE_MODEL = "google/gemma-4-31B-it"
JUDGE_MODEL = "mistral-large-latest"

# Exact system prompt the v2 adapter was trained with (transformTrainingData.ts SYSTEM_PROMPT_DE).
SYSTEM_PROMPT_DE = (
    "Du bist ein erfahrener Kommunikationsexperte von Bündnis 90/Die Grünen. "
    "Du schreibst authentische Texte im Stil der Grünen Partei — klar, sachlich, "
    "lösungsorientiert und in gendergerechter Sprache mit Genderstern (*). Du kennst "
    "die politischen Positionen, die Beschlusskultur und den Kommunikationsstil der Partei."
)

HARDWARE_PREFS = ["1x_nvidia_h100_80gb_sxm", "2x_nvidia_h100_80gb_sxm"]
GEN_TEMPERATURE = 0.7
GEN_MAX_TOKENS = 1024
ENDPOINT_START_TIMEOUT = 1800  # seconds — 2x_h100 dense-31B cold starts run ~15 min, variable

EVAL_DIR = Path("data/eval")
GENERATIONS_PATH = EVAL_DIR / "gemma4-generations.json"
SCORES_PATH = EVAL_DIR / "gemma4-scores.json"
REPORT_PATH = EVAL_DIR / "gemma4-eval-report.md"

# Gender intentionally excluded — not a production priority; structure/voice is what matters.
DIMENSIONS = ["positionen", "struktur", "ton", "authentizitaet", "directness"]

# 12 fixed prompts × 4 content types. Topics span Klima/Verkehr/Wohnen/Soziales.
PROMPTS = [
    {"id": "presse_oepnv", "type": "Pressemitteilung",
     "user_prompt": "Schreibe eine Pressemitteilung zum Thema: Ausbau des öffentlichen Nahverkehrs in ländlichen Regionen."},
    {"id": "presse_miete", "type": "Pressemitteilung",
     "user_prompt": "Schreibe eine Pressemitteilung als Reaktion auf stark steigende Mietpreise in den Großstädten."},
    {"id": "presse_solar", "type": "Pressemitteilung",
     "user_prompt": "Schreibe eine Pressemitteilung zu einem neuen Förderprogramm für Solaranlagen auf Schuldächern."},
    {"id": "insta_jobs", "type": "Instagram-Post",
     "user_prompt": "Schreibe einen Instagram-Post darüber, warum erneuerbare Energien Arbeitsplätze schaffen."},
    {"id": "insta_demo", "type": "Instagram-Post",
     "user_prompt": "Schreibe einen Instagram-Post, der zur Teilnahme an einer Klima-Demo aufruft."},
    {"id": "insta_radweg", "type": "Instagram-Post",
     "user_prompt": "Schreibe einen Instagram-Post über einen Erfolg beim kommunalen Radwegeausbau."},
    {"id": "antrag_ticket", "type": "Antrag",
     "user_prompt": "Formuliere einen Antrag zur Einführung eines kostenlosen Schülertickets im Nahverkehr."},
    {"id": "antrag_tempo30", "type": "Antrag",
     "user_prompt": "Formuliere einen Antrag für mehr Tempo-30-Zonen in Wohngebieten."},
    {"id": "beschluss_waerme", "type": "Beschluss",
     "user_prompt": "Formuliere einen Beschluss, die kommunale Wärmeplanung zu beschleunigen."},
    {"id": "rede_klima", "type": "Rede",
     "user_prompt": "Schreibe eine kurze Rede zum Thema Klimagerechtigkeit für eine Kundgebung."},
    {"id": "rede_kinder", "type": "Rede",
     "user_prompt": "Schreibe eine kurze Rede für den Gemeinderat, die mehr Haushaltsmittel für Kinderbetreuung fordert."},
    {"id": "newsletter_verkehr", "type": "Newsletter-Absatz",
     "user_prompt": "Schreibe einen Newsletter-Absatz mit einem Monatsupdate zur Verkehrswende vor Ort."},
]

# Count gender-inclusive forms with BOTH the asterisk (Genderstern, Schüler*innen) and the
# colon/Doppelpunkt (Schüler:innen) — v2 drifted to colon, so an asterisk-only regex
# massively undercounts its actual gendering.
GENDERSTERN_RE = re.compile(r"\w+[*:]innen?\b", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
def load_env() -> None:
    """Populate TOGETHER_API_KEY / MISTRAL_API_KEY from apps/api/.env if not already set."""
    for key in ("TOGETHER_API_KEY", "MISTRAL_API_KEY", "REGOLO_API_KEY"):
        if os.environ.get(key):
            continue
        for env_file in (Path(".env"), Path("../../.env")):
            if not env_file.exists():
                continue
            for line in env_file.read_text().splitlines():
                if line.startswith(f"{key}="):
                    os.environ[key] = line.split("=", 1)[1].strip().strip("\"'")
                    break
            if os.environ.get(key):
                break


def genderstern_count(text: str) -> int:
    return len(GENDERSTERN_RE.findall(text or ""))


# ---------------------------------------------------------------------------
# Phase 1 — generate
# ---------------------------------------------------------------------------
def base_is_serverless(client: Together) -> bool:
    """Probe whether the base model answers serverlessly (cheap) before spinning an endpoint."""
    try:
        client.chat.completions.create(
            model=BASE_MODEL,
            messages=[{"role": "user", "content": "Hi"}],
            max_tokens=1,
        )
        return True
    except Exception as exc:  # noqa: BLE001 — any failure → fall back to a dedicated endpoint
        print(f"  Base model not serverless ({type(exc).__name__}); will use a dedicated endpoint.")
        return False


def create_endpoint(client: Together, model: str):
    """Create a dedicated endpoint, wait for STARTED, return the endpoint object.

    Inference must target the returned endpoint's `.name`, NOT the model ID — a
    fine-tuned model is non-serverless and is only routable via its endpoint name.
    """
    last_err = None
    for hardware in HARDWARE_PREFS:
        try:
            print(f"  Creating endpoint for {model} on {hardware}...")
            endpoint = client.endpoints.create(
                display_name=f"eval-{model.split('/')[-1][:32]}",
                model=model,
                hardware=hardware,
                autoscaling={"min_replicas": 1, "max_replicas": 1},
            )
            break
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            print(f"    {hardware} unavailable ({type(exc).__name__}); trying next.")
    else:
        raise RuntimeError(f"Could not create endpoint for {model}: {last_err}")

    # Own the endpoint's lifecycle: if startup fails/times out, delete it HERE before
    # re-raising. The caller can't register it for teardown until we return, so a leak
    # is only preventable inside this function.
    try:
        deadline = time.monotonic() + ENDPOINT_START_TIMEOUT
        while time.monotonic() < deadline:
            ep = client.endpoints.retrieve(endpoint.id)
            print(f"    [{time.strftime('%H:%M:%S')}] endpoint {endpoint.id} state: {ep.state}")
            if ep.state == "STARTED":
                time.sleep(15)  # brief warmup grace before first inference
                return ep
            if ep.state in ("ERROR", "FAILED"):
                raise RuntimeError(f"Endpoint {endpoint.id} entered state {ep.state}")
            time.sleep(20)
        raise TimeoutError(f"Endpoint {endpoint.id} did not start within {ENDPOINT_START_TIMEOUT}s")
    except BaseException:
        try:
            client.endpoints.delete(endpoint.id)
            print(f"    Deleted endpoint {endpoint.id} after startup failure (no leak).")
        except Exception as exc:  # noqa: BLE001
            print(f"    WARNING: could not delete {endpoint.id}: {exc} — CHECK THE DASHBOARD!")
        raise


def generate_one(client: Together, model: str, prompt: dict, temperature: float) -> str:
    """Generate one completion. On persistent failure returns an [ERROR] sentinel
    instead of raising, so one flaky cell never discards the rest of the (paid) run."""
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT_DE},
        {"role": "user", "content": prompt["user_prompt"]},
    ]
    for attempt in range(5):
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=GEN_MAX_TOKENS,
            )
            return resp.choices[0].message.content or ""
        except Exception as exc:  # noqa: BLE001
            if attempt == 4:
                print(f"    GAVE UP {model} {prompt['id']} ({type(exc).__name__})")
                return f"[GENERATION FAILED: {type(exc).__name__}]"
            print(f"    retry {model} {prompt['id']} ({type(exc).__name__})")
            time.sleep(8)
    return ""


def generate_all(client: Together, temperature: float, reuse_base: bool) -> dict:
    EVAL_DIR.mkdir(parents=True, exist_ok=True)
    base_outputs: dict = {}

    # --reuse-base: load base completions from a prior run so we only re-spend on v2
    # and keep the base side identical across temperature sweeps.
    if reuse_base:
        prior = json.loads(GENERATIONS_PATH.read_text())
        base_outputs = {pid: d["base"] for pid, d in prior.items()}
        print(f"  Reusing {len(base_outputs)} base completions from {GENERATIONS_PATH}")
        base_serverless = True  # no base generation needed
    else:
        base_serverless = base_is_serverless(client)
        # Phase 1a: base FIRST when serverless — no endpoint billing, tolerate flakiness.
        if base_serverless:
            for i, prompt in enumerate(PROMPTS, 1):
                print(f"  [base {i}/{len(PROMPTS)}] {prompt['id']}")
                base_outputs[prompt["id"]] = generate_one(client, BASE_MODEL, prompt, temperature)

    # Phase 1b: spin the v2 endpoint and keep its uptime minimal.
    endpoint_ids: list[str] = []
    generations: dict = {}
    try:
        v2_ep = create_endpoint(client, V2_MODEL)
        endpoint_ids.append(v2_ep.id)
        v2_ref = v2_ep.name

        # Rare path: base not serverless and not reused → it needs its own endpoint.
        if not base_serverless:
            base_ep = create_endpoint(client, BASE_MODEL)
            endpoint_ids.append(base_ep.id)
            for i, prompt in enumerate(PROMPTS, 1):
                print(f"  [base {i}/{len(PROMPTS)}] {prompt['id']}")
                base_outputs[prompt["id"]] = generate_one(client, base_ep.name, prompt, temperature)

        for i, prompt in enumerate(PROMPTS, 1):
            print(f"  [v2 {i}/{len(PROMPTS)}] {prompt['id']} ({prompt['type']})")
            generations[prompt["id"]] = {
                "type": prompt["type"],
                "user_prompt": prompt["user_prompt"],
                "v2": generate_one(client, v2_ref, prompt, temperature),
                "base": base_outputs[prompt["id"]],
            }
    finally:
        # Billing safety: tear down every endpoint we created, even on error.
        for ep_id in endpoint_ids:
            try:
                client.endpoints.delete(ep_id)
                print(f"  Deleted endpoint {ep_id}")
            except Exception as exc:  # noqa: BLE001
                print(f"  WARNING: failed to delete endpoint {ep_id}: {exc} — check the dashboard!")

    GENERATIONS_PATH.write_text(json.dumps(generations, ensure_ascii=False, indent=2))
    print(f"  Saved generations → {GENERATIONS_PATH}")
    return generations


# ---------------------------------------------------------------------------
# Phase 2 — judge (Mistral Large, blind, positions swapped)
# ---------------------------------------------------------------------------
JUDGE_INSTRUCTIONS = (
    "Du bist eine strenge Jurorin für politische Kommunikation von Bündnis 90/Die Grünen. "
    "Du bewertest zwei Antworten (A und B) auf dieselbe Aufgabe. Bewerte jede Antwort auf einer "
    "Skala von 1 (schlecht) bis 5 (exzellent) in fünf Dimensionen:\n"
    "- positionen: korrekte grüne Positionen, Werte und Framing\n"
    "- struktur: authentische Struktur der Textsorte (z. B. bei Pressemitteilungen: "
    "namentlich benannte Sprecher*innen mit Zitaten, zitatgetrieben, KEINE generische "
    "Vorlage mit Platzhaltern wie [ORT]/[DATUM])\n"
    "- ton: klar, sachlich, lösungsorientiert, authentische Parteistimme\n"
    "- authentizitaet: klingt wie echte Grünen-Kommunikation, keine generischen KI-Floskeln\n"
    "- directness: liefert die Antwort DIREKT den fertigen, veröffentlichungsreifen Text? "
    "Eine Meta-Einleitung wie 'Hier ist ein Entwurf…' oder Kommentare an die Nutzer*in sind "
    "ein schwerer Mangel (niedrige Punktzahl), weil der Text so nicht direkt nutzbar ist.\n"
    "Antworte AUSSCHLIESSLICH mit JSON in genau diesem Schema:\n"
    '{"A":{"positionen":n,"struktur":n,"ton":n,"authentizitaet":n,"directness":n},'
    '"B":{"positionen":n,"struktur":n,"ton":n,"authentizitaet":n,"directness":n},'
    '"winner":"A"|"B"|"tie","begruendung":"ein Satz"}'
)


def mistral_judge(task_type: str, user_prompt: str, answer_a: str, answer_b: str) -> dict:
    content = (
        f"Aufgabe ({task_type}): {user_prompt}\n\n"
        f"--- Antwort A ---\n{answer_a}\n\n--- Antwort B ---\n{answer_b}"
    )
    resp = httpx.post(
        "https://api.mistral.ai/v1/chat/completions",
        headers={"Authorization": f"Bearer {os.environ['MISTRAL_API_KEY']}"},
        json={
            "model": JUDGE_MODEL,
            "messages": [
                {"role": "system", "content": JUDGE_INSTRUCTIONS},
                {"role": "user", "content": content},
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        },
        timeout=120,
    )
    resp.raise_for_status()
    return json.loads(resp.json()["choices"][0]["message"]["content"])


# EU-sovereign judge on Regolo. gpt-oss-120b is a *reasoning* model: thinking goes to
# reasoning_content, the answer to content — so allow a big token budget and extract the
# JSON object from content (which may carry stray text around it).
REGOLO_JUDGE_MODEL = "gpt-oss-120b"
_JSON_OBJ = re.compile(r"\{.*\}", re.DOTALL)


def regolo_judge(task_type: str, user_prompt: str, answer_a: str, answer_b: str) -> dict:
    content = (
        f"Aufgabe ({task_type}): {user_prompt}\n\n"
        f"--- Antwort A ---\n{answer_a}\n\n--- Antwort B ---\n{answer_b}"
    )
    for attempt in range(4):
        try:
            resp = httpx.post(
                "https://api.regolo.ai/v1/chat/completions",
                headers={"Authorization": f"Bearer {os.environ['REGOLO_API_KEY']}"},
                json={
                    "model": REGOLO_JUDGE_MODEL,
                    "messages": [
                        {"role": "system", "content": JUDGE_INSTRUCTIONS},
                        {"role": "user", "content": content},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 3000,  # reasoning model: leave room for thinking + JSON answer
                },
                timeout=300,
            )
            resp.raise_for_status()
            text = resp.json()["choices"][0]["message"].get("content") or ""
            m = _JSON_OBJ.search(text)
            if not m:
                raise ValueError("no JSON object in judge output")
            return json.loads(m.group(0))
        except Exception as exc:  # noqa: BLE001
            if attempt == 3:
                raise
            time.sleep(5)
    raise RuntimeError("regolo_judge exhausted retries")


def judge_all(generations: dict) -> dict:
    scores: dict = {}
    for i, (pid, gen) in enumerate(generations.items(), 1):
        print(f"  [{i}/{len(generations)}] judging {pid}")
        v2_dims, base_dims, winners = [], [], []
        # Two passes: pass 0 → v2 is A; pass 1 → v2 is B. Cancels position bias.
        for v2_is_a in (True, False):
            a, b = (gen["v2"], gen["base"]) if v2_is_a else (gen["base"], gen["v2"])
            verdict = mistral_judge(gen["type"], gen["user_prompt"], a, b)
            v2_side, base_side = ("A", "B") if v2_is_a else ("B", "A")
            v2_dims.append(verdict[v2_side])
            base_dims.append(verdict[base_side])
            w = verdict.get("winner", "tie")
            if w == "tie":
                winners.append("tie")
            else:
                winners.append("v2" if w == v2_side else "base")

        def mean_dims(rows: list) -> dict:
            return {d: round(sum(r[d] for r in rows) / len(rows), 2) for d in DIMENSIONS}

        # Winner only if both passes agree; otherwise tie (position-bias guard).
        winner = winners[0] if winners[0] == winners[1] else "tie"
        scores[pid] = {
            "type": gen["type"],
            "winner": winner,
            "v2": mean_dims(v2_dims),
            "base": mean_dims(base_dims),
            "v2_genderstern_count": genderstern_count(gen["v2"]),
            "base_genderstern_count": genderstern_count(gen["base"]),
        }
    SCORES_PATH.write_text(json.dumps(scores, ensure_ascii=False, indent=2))
    print(f"  Saved scores → {SCORES_PATH}")
    return scores


# ---------------------------------------------------------------------------
# Phase 3 — report
# ---------------------------------------------------------------------------
def render_report(generations: dict, scores: dict) -> None:
    wins = {"v2": 0, "base": 0, "tie": 0}
    for s in scores.values():
        wins[s["winner"]] += 1

    def overall(side: str) -> dict:
        return {d: round(sum(s[side][d] for s in scores.values()) / len(scores), 2) for d in DIMENSIONS}

    v2_means, base_means = overall("v2"), overall("base")
    v2_gs = sum(s["v2_genderstern_count"] for s in scores.values())
    base_gs = sum(s["base_genderstern_count"] for s in scores.values())

    promote = wins["v2"] > wins["base"] and v2_means["struktur"] >= base_means["struktur"]

    lines = [
        "# Gemma 4 v2 — Quality-Gate Eval Report",
        "",
        f"**Fine-tune:** `{V2_MODEL}`  ",
        f"**Base:** `{BASE_MODEL}`  ",
        f"**Judge:** `{JUDGE_MODEL}` (blind pairwise, positions swapped)  ",
        f"**Prompts:** {len(scores)} across {len({s['type'] for s in scores.values()})} content types",
        "",
        "## Win-rate",
        f"- **v2 wins:** {wins['v2']}/{len(scores)}",
        f"- **base wins:** {wins['base']}/{len(scores)}",
        f"- **ties:** {wins['tie']}/{len(scores)}",
        "",
        "## Mean dimension scores (1–5)",
        "| Dimension | v2 | base |",
        "|---|---|---|",
    ]
    for d in DIMENSIONS:
        lines.append(f"| {d} | {v2_means[d]} | {base_means[d]} |")
    lines += [
        "",
        f"**Genderstern total:** v2 {v2_gs} vs base {base_gs}",
        "",
        f"## Recommendation: {'✅ PROMOTE v2' if promote else '⚠️ HOLD — review before promoting'}",
        "",
        "## Per-prompt",
        "| Prompt | Type | Winner | v2 *innen | base *innen |",
        "|---|---|---|---|---|",
    ]
    for pid, s in scores.items():
        lines.append(f"| {pid} | {s['type']} | **{s['winner']}** | {s['v2_genderstern_count']} | {s['base_genderstern_count']} |")

    lines += ["", "## Side-by-side excerpts (first 3 prompts)", ""]
    for pid in list(generations)[:3]:
        gen = generations[pid]
        lines += [
            f"### {pid} — {gen['type']}",
            f"_Prompt: {gen['user_prompt']}_",
            "",
            "**v2:**", "", "> " + (gen["v2"][:500].replace("\n", "\n> ")), "",
            "**base:**", "", "> " + (gen["base"][:500].replace("\n", "\n> ")), "",
        ]

    REPORT_PATH.write_text("\n".join(lines))
    print(f"  Saved report → {REPORT_PATH}")
    print(f"\n  Win-rate: v2 {wins['v2']} | base {wins['base']} | tie {wins['tie']}")
    print(f"  Recommendation: {'PROMOTE v2' if promote else 'HOLD'}")


# ---------------------------------------------------------------------------
def kill_endpoints(client: Together) -> None:
    """Safety sweep — deletes ONLY this eval's endpoints (display_name starts with 'eval-').

    The account holds many production endpoints (image models etc.); never touch those.
    """
    data = getattr(client.endpoints.list(), "data", [])
    ours = [e for e in data if str(getattr(e, "display_name", "")).startswith("eval-")]
    if not ours:
        print("No eval-* endpoints to delete.")
        return
    for ep in ours:
        print(f"Deleting endpoint {ep.id} ({getattr(ep, 'display_name', '')})")
        client.endpoints.delete(ep.id)


def main() -> None:
    parser = argparse.ArgumentParser(description="Gemma 4 v2 vs base quality-gate eval")
    parser.add_argument("--judge-only", action="store_true", help="Re-judge saved generations (no endpoint)")
    parser.add_argument("--report-only", action="store_true", help="Re-render report from saved scores")
    parser.add_argument("--kill-endpoints", action="store_true", help="Delete all running endpoints and exit")
    parser.add_argument("--temperature", type=float, default=0.7, help="Generation temperature (default: 0.7)")
    parser.add_argument("--reuse-base", action="store_true", help="Reuse base completions from the saved generations file; only regenerate v2")
    args = parser.parse_args()

    load_env()
    if not os.environ.get("TOGETHER_API_KEY"):
        sys.exit("TOGETHER_API_KEY not set")
    # Generous timeout + SDK retries: serverless 31B can be slow/queued under load.
    client = Together(timeout=600.0, max_retries=4)

    if args.kill_endpoints:
        kill_endpoints(client)
        return

    if args.report_only:
        generations = json.loads(GENERATIONS_PATH.read_text())
        scores = json.loads(SCORES_PATH.read_text())
        render_report(generations, scores)
        return

    if args.judge_only:
        generations = json.loads(GENERATIONS_PATH.read_text())
    else:
        print(f"Phase 1: GENERATE (temperature={args.temperature}, reuse_base={args.reuse_base})")
        generations = generate_all(client, args.temperature, args.reuse_base)

    if not os.environ.get("MISTRAL_API_KEY"):
        sys.exit("MISTRAL_API_KEY not set — needed for judging")
    print("Phase 2: JUDGE")
    scores = judge_all(generations)
    print("Phase 3: REPORT")
    render_report(generations, scores)


if __name__ == "__main__":
    main()
