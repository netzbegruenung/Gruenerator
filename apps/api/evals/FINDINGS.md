# Chat agentic-loop — eval findings

Run: 20-case corpus, **local backend** (worktree `feat/agentic-loop-tuning`,
`CHAT_AGENT_LOOP=true`), **gemma split lane** (planner `verdigado-pro`, synth
`gemma4-31b`), 2026-07-13.

**Score: 18/20 cases (90%), 65/67 assertions (97%). Latency p50 11.5 s · p95 26.4 s.**

Both case failures are the same class (missing citations). Several _passing_
cases still show behaviour worth fixing (over-search, web-after-internal) that
the current assertions don't yet flag — captured below.

---

## ✅ Confirmed working (live)

- **Demotion (WS-B):** every factual/verb-first/false-premise/obscure/injection
  prompt routed `intent=agentic` with **no LLM classifier call** — incl.
  `worüber`, `Hat X …?`, `Stimmt es …?`.
- **Compound sharepic in split mode (WS-C):** `compound-sharepic-1/2` →
  `tools=[gruenerator_search, …, sharepic]` — searches **then** generates. The
  „ich kann keine Bilder erstellen" refusal is gone.
- **Domain tools:** `worüber`→`bundestag`; `voting-record`→`abgeordnetenwatch`+
  `bundestag`; `examples`→`gruenerator_pressemitteilung_examples`.
- **Honesty:** both false-premise cases corrected the premise.
- **Multi-topic coverage:** all 3 topics covered, clean `[N]`.
- **Fast paths intact:** greeting/creative/summary-followup → `direct`, no tools;
  `pure-sharepic` → single-pass `sharepic`, no search (fixed-text contract).
- **No 45–86 s stalls** — the reasoning first-token deadline cut (45→20 s) held.

---

## Issues (severity-ranked)

### 1. HIGH — Flaky / missing citations

- **Evidence:** `factual-position-1` and `internal-prefer-1` failed on
  `cited: no [N] citation markers`. The **same** `factual-position` prompt had
  `[N]` on an earlier run and none here — non-deterministic. Separately, the
  multi-topic answer wrote `[1][2][3]` but **`done.citations = 0`** (markers map
  to nothing → not clickable).
- **Root cause:** the gemma synth inconsistently emits `[N]` (prompt-only
  instruction unreliable, same failure mode as prompt-only search steering), and
  the registry→`done.citations` projection returns empty on the agentic path.
- **Fix (structural, not prompt):**
  - Trace `sourceRegistry.getCitations()` → `done.citations` on the agentic
    path — why is it 0 when the registry has results?
  - Post-process the synth output: validate/normalise citation markers against
    the registry (bracket bare numbers, drop out-of-range, ensure ≥1 when
    sources exist) instead of trusting the model.

### 2. MEDIUM — Over-searching persists (near-dup dedup too weak)

- **Evidence (search counts this run):** `multitopic` 9× `gruenerator_search`,
  `internal-prefer` 5×, `injection` 5× (same injection string), `comparison` 4×,
  `false-premise-1` 6× (4 internal + 2 web). The Jaccard-0.6 dedup isn't
  collapsing one-topic rephrasings.
- **Root cause:** 0.6 threshold + single-word/one-addition pairs
  („Vermögensteuer" vs „Vermögensteuer Abschaffung" = 0.5) slip through; a
  topic gets re-searched 3–5 ways.
- **Fix:** lower the near-dup threshold to ~0.5 and/or add substring-containment
  (one query ⊂ another on the same tool → near-dup); consider a per-topic search
  cap.

### 3. MEDIUM — Web search still used despite prefer-internal

- **Evidence:** 7 web calls across the run; `factual-position` (3 internal +
  web), `false-premise-1` (2 web), both compound-sharepics used web. The
  prefer-internal guard (block web once internal ≥3 sources) isn't consistently
  stopping it.
- **Root cause (to confirm):** either the internal search returned <3 _unique_
  registry sources (so the guard didn't trip), or the guard isn't evaluated
  before the web call in split-gather. Also saw the **same** web query issued
  repeatedly (Kindergrundsicherung ×3 in the log) — web_search not covered by
  the turn-wide dedup as tightly as internal.
- **Fix:** verify the guard fires in the split-gather path; count _registry
  growth from internal_ (not raw call count) for the ≥3 threshold; ensure
  web_search goes through the same near-dup dedup.

### 4. MEDIUM — Latency on multi-search turns

- **Evidence:** p95 26.4 s; `comparison` 26.4 s, `examples` 25.3 s,
  `internal-prefer` 22.3 s, `multitopic` 21.1 s. Driven by search count ×
  embedding latency + the gemma synth pass.
- **Fix:** fewer searches (issues #2/#3 directly help); embedding cache is
  already hitting; consider capping total searches lower once dedup is tighter.

### 5. LOW — Garbage / injection demoted into the loop

- **Evidence:** `garbage-1` (`asdf qwer …`) → `intent=agentic` (answered with no
  tools — harmless but a wasted loop entry); `injection-1` ran 5 searches on the
  injection string.
- **Fix:** optional — a cheap „looks like nonsense" guard could keep garbage on
  the direct fast path; low priority.

---

## Harness improvements (this eval tooling)

- **`internalOnly` assertion is too lenient** — it did **not** flag
  `factual-position`'s web-after-internal use. The „internal returned results"
  probe relies on the tool summary string; make it read registry/source counts
  from `tool_step_result` instead.
- **Persist `fullText` + `sources` + tool summaries in `last-run.json`** so
  citation/over-search issues can be inspected without re-curling.
- **Add an LLM-judge pass** over `last-run.json` for groundedness/honesty/
  completeness (the ~20% the regex can't score).
- **Run the Mistral (unified) lane too** — this run is gemma-split only.

---

## Reproduce

```bash
# backend from the worktree, loop on, dev-bypass in apps/api/.env
CHAT_AGENT_LOOP=true pnpm --filter @gruenerator/api start:backend   # :3001
EVAL_BYPASS_TOKEN=<DEV_AUTH_BYPASS_TOKEN> pnpm --filter @gruenerator/api eval:chat
# subset:  EVAL_FILTER=factual-position-1,multitopic-compare-1 …
# baseline: EVAL_UPDATE_BASELINE=1 …
```
