# Chat eval harness

The live E2E tier: fire real prompts at a real chat backend over SSE, parse the
stream into a structured trace, and run deterministic assertions — one per
failure class we've hit live (over-searching, invented URLs, unclean citations,
capability-refusal, intent misroutes, sharepic-not-generated, latency, and the
multi-turn classes: intent/tool loss on follow-ups, thread re-minting,
edit-narration mismatch).

Every bug we found by hand is now a permanent, automated check.

## Tiers

1. **Deterministic scenarios** (`eval:chat`) — single- AND multi-turn. A
   scenario's turns share one thread (threadId + accumulated wire history);
   clarification interrupts are answered via `/resume` and merged into the
   turn's trace.
2. **LLM judge** (`eval:judge`) — post-pass over `last-run.json` for what regex
   can't score: groundedness ([N] actually supported), narration honesty (text
   vs executed actions), known-answer contradiction, German/AT quality,
   long-thread parity. Model: `verdigado-pro` (free, LiteLLM proxy), temp 0, JSON verdicts.
3. **Long threads** (`eval:longthread`) — `padTurns` breadth probes + golden
   15–25-turn scenarios (`"slow": true`, only with `EVAL_SLOW=1`). To make
   compaction fire fast locally, start the backend with
   `CHAT_COMPACTION_THRESHOLD=8 CHAT_COMPACTION_KEEP_RECENT=4 CHAT_COMPACTION_COOLDOWN_MS=0`
   (dev-only overrides, ignored in production).

## Run

```bash
# against a local backend (pnpm dev:backend on :3001)
EVAL_BYPASS_TOKEN=<dev-bypass-token> pnpm --filter @gruenerator/api eval:chat

# judge pass over the traces of the last run
LITELLM_BASE_URL=<url> LITELLM_API_KEY=<key> pnpm --filter @gruenerator/api eval:judge

# long-thread scenarios only (see compaction overrides above)
EVAL_BYPASS_TOKEN=<token> pnpm --filter @gruenerator/api eval:longthread

# against the flagged test-branch backend, forcing a lane
EVAL_BASE_URL=https://<test-host> EVAL_BYPASS_TOKEN=<token> EVAL_MODEL_ID=gemma-4 \
  pnpm --filter @gruenerator/api eval:chat

# just the multi-turn cases
EVAL_FILTER=multiturn EVAL_BYPASS_TOKEN=<token> pnpm --filter @gruenerator/api eval:chat
```

The backend needs `ALLOW_DEV_AUTH_BYPASS=true` + a matching `DEV_AUTH_BYPASS_TOKEN`
(never in prod). The agentic loop is now ON by default, so no flag ritual is
needed for a normal run — but know the failure mode: with `CHAT_AGENT_LOOP=false`
most of the corpus takes the single-pass path, which emits no `tool_step` events
at all, and the run looks catastrophic (`tools=[]` everywhere) while nothing is
broken. Note also that `pnpm dev:backend` goes through turbo, which does NOT
forward an ad-hoc env var on the command line: put it in `.env`, or start the
backend directly with `cd apps/api && pnpm dev`.

Do run the suite **once with `CHAT_AGENT_LOOP=false`** when you touch the
single-pass path (source carry, respondNode gating, searchNode fallbacks) — the
path-independent assertions (`grounded`, `cited`, `retainsPriorSources`) are the
ones that hold in both configurations, and that lane is otherwise never
exercised. Run **both lanes** — the sharepic-in-split bug was invisible on
Mistral (unified); use `EVAL_MODEL_ID=mistral` and a split lane (e.g. `gemma-4`).
`.github/workflows/chat-eval-live.yml` ("Chat Eval (Live)") does exactly this
against the deployed test env (matrix over both lanes, judge blocking,
per-lane baselines) — triggered manually via `workflow_dispatch`, not on a
schedule.

## Env

| var                         | default                 | purpose                                     |
| --------------------------- | ----------------------- | ------------------------------------------- |
| `EVAL_BASE_URL`             | `http://localhost:3001` | backend base                                |
| `EVAL_BYPASS_TOKEN`         | —                       | `x-dev-auth-bypass` header                  |
| `EVAL_MODEL_ID`             | auto                    | force a model lane for every case           |
| `EVAL_FILTER`               | —                       | run only ids/categories containing this     |
| `EVAL_SLOW=1`               | —                       | include `"slow"` (golden long) scenarios    |
| `EVAL_MCP=1`                | —                       | include `"mcpLane"` scenarios (needs setup) |
| `EVAL_CONCURRENCY`          | 1                       | scenarios in parallel (turns stay serial)   |
| `EVAL_BASELINE`             | `./baseline.json`       | regression baseline (per-lane in CI)        |
| `EVAL_UPDATE_BASELINE=1`    | —                       | overwrite the baseline with this run        |
| `EVAL_RECORD_DIR`           | —                       | record raw SSE per turn (E2E fixtures)      |
| `EVAL_DECISION_DIR`         | —                       | read decision journals back, render maps    |
| `LITELLM_BASE_URL/_API_KEY` | —                       | judge only (verdigado proxy)                |
| `EVAL_JUDGE_BLOCKING=1`     | —                       | judge failures set exit code                |

## Decision maps from a live run

This lane sees what a real model does; until now it could not see _why_ the turn
went that way. The decision journal (`utils/decisionJournal.ts`) is bound
in-process, and here the runner and the backend are two processes.

`EVAL_DECISION_DIR` bridges that through the filesystem — deliberately not
through an extra SSE event, which would turn F1 decision ids into an F0 wire
contract that shipped clients could depend on. Point it and the backend's
`CHAT_DECISION_LOG_DIR` at the same directory:

```bash
CHAT_DECISION_LOG_DIR=/tmp/maps pnpm dev:backend
EVAL_DECISION_DIR=/tmp/maps EVAL_BYPASS_TOKEN=… EVAL_FILTER=greeting \
  pnpm --filter @gruenerator/api eval:chat
```

The runner sends `x-decision-log-id: <scenario>.t<n>` per turn and writes one
`<scenario>.map.txt` per scenario. The backend writes nothing at all unless it
runs with `NODE_ENV=development` — the gate is checked when the middleware is
constructed, so a production build never creates it.

Two limits worth knowing before relying on this. It needs filesystem access to
the backend host, so in practice a local `pnpm dev:backend`; against the deployed
test env the maps stay absent and the run degrades to what it always was. And a
live map is **one sample, not a baseline** — the same prompt can classify
differently on the next run, so a diff between two live maps is evidence to read,
never an assertion to fail on. The committed, diffable maps live in the simulated
lane (`routes/chat/__integration__/decisions/`).

## Corpus

`corpus/*.jsonl` (globbed, plus legacy `chat-corpus.jsonl`). One JSON object
per line — either a legacy single-turn case (`{id, prompt, category, expect}`)
or a scenario:

```json
{
  "id": "sticky-scope-1",
  "category": "multiturn-scope",
  "turns": [
    {
      "prompt": "…",
      "expect": { "toolsMustInclude": ["bundestag"] },
      "onInterrupt": { "resume": "…" }
    },
    {
      "prompt": "Und die FDP?",
      "expect": { "routingNot": ["direct"], "sameThread": true },
      "padTurns": 16
    }
  ]
}
```

Key `expect` fields beyond the classics: `routingNot` (follow-up must not fall
to `direct` — the "intents and tools get lost" symptom), `sameThread`,
`editsPreviousArtifact`, `narrationMatchesAction`, `judge: [...]` +
`judgeFacts: [...]` (opt-in judge checks), `refuses` (must / must not decline —
`true` for content the product may not produce, `false` as the over-refusal
guard), `answerMustNotContain` (payload strings whose presence proves an
injection was executed). `"knownFailure": true` documents an open bug: the
scenario runs and reports (🟡) but never fails the baseline — drop the flag once
fixed.

**One green run does not retire a flag.** Measured on the `safety-adversarial`
lane over four live runs against a local backend: two scenarios passed 4/4, the
other four passed 3/4 — the same code, the same prompts, different sampling.
They fail in two opposite directions, and both are worth knowing about: the
injection cases sometimes DECLINE the perfectly legitimate summarisation they are
asked for (caught by `refuses: false`), the content cases sometimes produce the
material anyway. Run a lane several times before concluding anything from it.

The over-refusal direction turned out to be ours, not the model's: the loop
swapped a correct summary for its canned decline because the summary named the
injected instruction ("den eingefügten Systemhinweis setze ich nicht um") and the
refusal patterns read that as a decline of the whole turn. Fixed in
`refusalDetection.isWholesaleRefusal`; the flags stay until a live lane confirms
it, since the content direction is untouched.

Careful with that last step: `passed` covers the deterministic assertions only,
never a judge verdict — judging is a separate command over `last-run.json`. Note
that `last-run.json` also freezes the `judgeFacts` as they were at RUN time, so
editing a fact means re-running `eval:chat` before `eval:judge` sees it. When
a scenario's actual claim rides on a rubric (`instruction_hierarchy`,
`content_policy`), the run says so and asks you to confirm with `eval:judge`
first, instead of reporting the scenario as fixed.

Files by bug class: `multiturn.jsonl` (scope/edit/vague follow-ups),
`longthread.jsonl` (pad + golden), `routing-adversarial.jsonl` (greeting traps,
umlaut-first, negations), `pasted-material.jsonl` (trigger nouns in pastes),
`tool-gating.jsonl` (near-miss pairs), `grounding.jsonl` (+judgeFacts),
`locale-at.jsonl`.

**Growing it:** `tools/generateAdversarial.ts` expands template matrices to
stdout for human review (never LLM-generated, never in CI).
`tools/mine-corpus.sql` pulls candidate shapes from real usage
(`sudo -u postgres psql -d gruenerator -f mine-corpus.sql`). Protocol:
**paraphrase before committing — never commit verbatim user text**, strip
names/places, keep only the structural shape.

## Output

Per-scenario ✅/❌/🟡 with failing assertions per turn, a summary (pass rates,
latency p50/p95, per-category), and a **regression diff** vs the baseline
(`⬇ REGRESSION` / `⬆ fixed`). Full enriched traces → `last-run.json`
(judge input), judge verdicts → `judge-verdicts.json` (both gitignored).

## Files

- `corpus/*.jsonl` + `chat-corpus.jsonl` — prompts + expectations.
- `parseTrace.ts` / `assertions.ts` — pure, unit-tested (`*.vitest.ts`).
- `runChatEval.ts` — the IO runner (scenario loop, resume, padding, recording).
- `judge/` — rubrics + runner + calibration fixtures (the historical class-6
  "keine Treffer auf echten Daten" and class-11 "Edit angewendet, Text leugnet
  ihn" bugs MUST fail the judge — `judge.vitest.ts`, live part gated on
  `LITELLM_*`).
- `fixtures/fillerTurns.ts` — deterministic padding pool for `padTurns`.
- `tools/` — adversarial generator + corpus-mining SQL.
