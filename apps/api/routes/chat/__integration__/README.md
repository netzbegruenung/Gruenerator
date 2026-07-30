# Chat handler — in-process integration tests

The missing middle tier. Below it, ~150 unit test files cover the ChatGraph
nodes and the chat services. Above it, the live eval lane
(`apps/api/evals/`) fires real prompts at a real backend. Between them sat
`chatGraphContractRouter.ts` — 2306 lines, the sole handler for
`/api/chat-graph/*`, imported by no test at all.

These tests mount that router on a bare `express()` app, drive it over real
HTTP, and parse the SSE stream with the **same** code the live lane uses
(`evals/parseTrace.ts`, `evals/assertions.ts` — reused, never re-implemented).

## What these tests own

The sequencing and precedence between `buildStreamContext` and `sse.end()`:
which gate consults which predicate on which text, in which order, and what
reaches the wire as a result.

## What they do not own

| Concern                                                                | Where it lives                                                        |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Model behaviour, the tool loop                                         | `services/agenticLoop/loopEngine.vitest.ts` (its own `LoopDeps` seam) |
| The routing decision table                                             | `services/agenticLoop/routing.vitest.ts` (48 cases)                   |
| The guard predicates themselves                                        | `ChatGraph/nodes/fastPathGuards.vitest.ts`                            |
| Persistence SQL                                                        | `services/threadPersistenceService` tests                             |
| HTTP 401/403 and session resolution                                    | `middleware/authMiddleware.vitest.ts`                                 |
| Answer QUALITY — groundedness, citations, refusals, German/AT register | the manual live lane + LLM judge (`apps/api/evals/`)                  |

A green run here says the branches ran as intended. It says nothing about
whether the product answers well.

## Running

```bash
npx vitest run apps/api/routes/chat/__integration__ --root apps/api
```

No backend, no database, no network, no secrets — ~10 s, dominated by the
router's import graph. `installNetworkGuard()` throws on any outbound request,
so a missing mock fails by name instead of silently reaching the internet.

## The four rails that keep these tests honest

Each exists because its absence produces a suite that passes while testing
nothing. None of them should be "simplified" away.

1. **`runTurn` asserts `trace.error === null` by default.** The router's outer
   catch turns every unmocked dependency into an SSE `error`, and `buildTrace`
   stamps a missing terminal event. This one line converts a silently broken
   mock into a named failure.
2. **The classifier double delegates to the real `classifierNode`.** Tests opt
   into scripting. Otherwise a test named "sharepic licence" passes without
   `hasExplicitSharepicWord` ever executing.
3. **The `aiWorkerPool` stub throws on an unscripted request type, and
   `assertScriptsConsumed()` throws on a scripted reply nobody asked for.**
   Most phrasings resolve in the classifier's heuristic tiers without any model
   call. Without both halves, a test that scripts an LLM verdict can silently
   pin a path the turn never took — this actually happened while writing these
   tests, in four separate cases.
4. **Routing assertions check the recorded call alongside the SSE flag.** The
   router reads the same `runAgentic` boolean twice (once to stamp
   `intent.agentic`, once to pick the branch). Asserting either alone leaves a
   regression class uncovered.

Related: `pinChatEnv()` pins every env var that steers routing. `vitest.config.ts`
loads the developer's `.env`, and several of these are read at call time — an
unpinned `SYSTEM_MCP_*_URL` changes which branch a turn takes, so the same test
would mean different things on different machines. A guard test asserts the pins.

## Simulated runs and the decision map

`simulatedRun.vitest.ts` takes the same harness one step further: realistic
prompts through the real router, the real classifier and the real guards, with
the model scripted, recording **which decisions were taken** on the way.

The recorder is `apps/api/utils/decisionJournal.ts` — an AsyncLocalStorage
journal in the idiom of `utils/usageContext.ts`, bound here by a middleware and
by nothing at all in production, where `recordDecision` is a `getStore()` and a
return. It exists because the wire shows only outcomes: which guard fired, why
the classifier demoted, which of the loop's three silent answer-substitutions
took effect are all invisible from outside, and that is where the expensive bugs
were.

Each run renders to a committed map under `decisions/`. Three states per point,
which is what makes a regression readable:

```
router.persistent_action_gate  = demoted_primary_to_direct   family=document
router.run_agentic             = single_pass                 gateOpen=false …
loop.synth_verdict             = (not reached)
loop.tool_guard                = (none)
```

`(not reached)` is the valuable one: a refactor that routes _around_ a gate
shows up there and nowhere else. When a guard stops firing, the diff names the
guard, the branch that won instead, and the user-visible consequence — four
lines, and nothing else moves, because the columns are fixed and the order comes
from the registry.

Regenerate with `SIM_UPDATE=1`. A **missing** map is a failure, never a silent
create — otherwise a renamed scenario blesses itself.

### Two files, because `vi.mock` is per file

`simulatedRun.vitest.ts` replaces `streamAgenticResponse`, which is what makes
the ~2000 lines of router sequencing testable — but it also means the loop never
executes, so both loop decision points render as `(not reached)` there.

`loopRun.vitest.ts` keeps that service real and replaces `ai`'s `streamText`
instead. `loopEngine` builds its `defaultDeps` from that import at module scope
and `runAgenticLoop(p, deps = defaultDeps)` reads them from there, so the seam
already existed — **no production change was needed**. `harness/loopScript.ts`
queues one response per expected `streamText` call and throws on an unconsumed
one, because a leftover entry means the turn took a different shape (unified
instead of split, or a synth retry that never happened) than the scenario claims.

It does **not** replay the AI SDK's step loop. Scripted tool calls are executed
directly, in order — enough for the guards, which read call history, and
deliberately not enough to support any claim about how a real model would step.

### The same map from a real backend

The journal is bound in-process here, which is exactly what the live lane cannot
do — there the runner and the backend are two processes, so nothing binds a
recorder and every `recordDecision` is the no-op it is in production. The result
was inverted: the only lane that sees real model behaviour was the only lane
with no view of why the turn went that way.

`utils/decisionLog.ts` closes that without putting decision ids on the wire —
they are F1, and emitting them would make them F0, a contract shipped clients
could come to depend on. Instead the journal leaves through the filesystem,
under a name the client picks:

```bash
CHAT_DECISION_LOG_DIR=/tmp/maps pnpm dev:backend      # NODE_ENV=development only
EVAL_DECISION_DIR=/tmp/maps EVAL_BYPASS_TOKEN=… pnpm --filter @gruenerator/api eval:chat
```

The runner sends `x-decision-log-id: <scenario>.t<n>`, reads the file back and
renders one `<scenario>.map.txt` per scenario with `renderDecisionMap(…, 'live')`
— the same renderer, a different caveat printed into the artefact. A live map is
**one sample, not a baseline**: the same prompt can classify differently on the
next run, so a diff between two live maps is evidence to read, never an assertion
to fail on. Nothing is committed.

The gate is `NODE_ENV === 'development'`, checked when the middleware is
constructed, so in production it is never created and no request binds a journal.
`decisionLogRoundTrip.vitest.ts` owns the transport: header → file → reader →
map, including the `/resume` merge.

### What a green simulated run does and does not mean

It proves the branches ran as scripted. It proves **nothing** about what a real
model does: every scripted verdict is an assumption, which is why each scenario
carries a required `note` stating that assumption and when it was last checked.
If the real classifier stops producing that verdict, the scenario stays green
while the product is broken.

Groundedness, citation correctness, refusal and over-refusal behaviour, and
German/Austrian register are measured **only** by the manual live lane plus the
LLM judge in `apps/api/evals/`. There is deliberately no combined pass rate
across the two lanes, and the word `eval` is reserved for the live one.

## Not yet covered

- **`loop.tool_guard`** — the six guard branches need the fake to drive tool
  calls, which `harness/loopScript.ts` supports (`ScriptedCall`) but no scenario
  uses yet. `duplicate` and `search_budget` are reachable in two or three
  scripted steps; `failure_cap` and `failure_budget` additionally need tools that
  throw. `search_concurrency` is a **deferral** whose outcome depends on await
  interleaving — a scenario for it must assert the NUMBER of deferrals, never
  which call lost, and the renderer already sorts that point by content rather
  than by `seq` for the same reason. Note the standing cost: a tool override
  skips the real implementations, so the source registry stays empty and
  `cited`/`grounded` are meaningless in this lane.
- **`/resume`** — the interrupt → `pipelineStateStore` → resume round trip. The
  valuable assertion there is field-by-field lockstep between the 14-field
  `requestContext` the router stores and what `resumePipeline` reads back; the
  router's own comment warns that three hand-maintained copies of that shape
  "guaranteed a new field would eventually land in only two".
- **The citation clamp** (`stripOutOfRangeCitations` → `completion` only when the
  text actually changed) — needs sources on the state, so it wants the search
  path stubbed rather than the respond boundary.
