# Chat eval harness

The missing E2E tier: fire real prompts at a real chat backend over SSE, parse
the stream into a structured trace, and run deterministic assertions — one per
failure class we've hit live (over-searching, invented URLs, unclean citations,
capability-refusal, intent misroutes, sharepic-not-generated, latency).

Every bug we found by hand is now a permanent, automated check.

## Run

```bash
# against a local backend (pnpm dev:backend on :3001)
EVAL_BYPASS_TOKEN=<dev-bypass-token> pnpm --filter @gruenerator/api eval:chat

# against the flagged test-branch backend, forcing a lane
EVAL_BASE_URL=https://<test-host> EVAL_BYPASS_TOKEN=<token> EVAL_MODEL_ID=gemma-4 \
  pnpm --filter @gruenerator/api eval:chat

# just the compound cases
EVAL_FILTER=compound EVAL_BYPASS_TOKEN=<token> pnpm --filter @gruenerator/api eval:chat
```

The backend needs `ALLOW_DEV_AUTH_BYPASS=true` + a matching `DEV_AUTH_BYPASS_TOKEN`
(never in prod). Run **both lanes** — the sharepic-in-split bug was invisible on
Mistral (unified); use `EVAL_MODEL_ID=mistral` and a split lane (e.g. `gemma-4`).

## Env

| var                      | default                 | purpose                                 |
| ------------------------ | ----------------------- | --------------------------------------- |
| `EVAL_BASE_URL`          | `http://localhost:3001` | backend base                            |
| `EVAL_BYPASS_TOKEN`      | —                       | `x-dev-auth-bypass` header              |
| `EVAL_MODEL_ID`          | auto                    | force a model lane for every case       |
| `EVAL_FILTER`            | —                       | run only ids/categories containing this |
| `EVAL_BASELINE`          | `./baseline.json`       | regression baseline                     |
| `EVAL_UPDATE_BASELINE=1` | —                       | overwrite the baseline with this run    |

## Output

Per-case ✅/❌ with the failing assertions, a summary (case + assertion pass
rates, latency p50/p95, per-category), and a **regression diff** vs
`baseline.json` (`⬇ REGRESSION` / `⬆ fixed`). The full run is written to
`last-run.json` for debugging and the (planned) LLM-judge pass.

## Files

- `chat-corpus.jsonl` — the prompts + expectations. Grow it: mine real questions
  from `chat_messages`, add adversarial/AT-locale cases.
- `parseTrace.ts` / `assertions.ts` — pure, unit-tested (`*.vitest.ts`).
- `runChatEval.ts` — the IO runner.

## Not here yet (follow-ups)

- **LLM judge** over `last-run.json` for groundedness/honesty/completeness
  (the ~20% regex can't score).
- **DB-mined corpus** from real user chats.
- **CI/nightly** wiring once a flagged eval backend is reachable from CI.
