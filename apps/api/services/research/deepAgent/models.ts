/**
 * LangChain chat models for the deep research agent.
 *
 * A second model surface next to `services/ai/providerInstances.ts` on purpose:
 * `deepagents` runs on LangChain, the rest of the app on the AI SDK, and there
 * is no bridge between the two tool protocols. Only the plumbing is shared —
 * base URL, key and the model ids — so a Scaleway project change still happens
 * in one place (`scalewayEndpoint.ts`).
 *
 * Both lanes are OpenAI-compatible, so `ChatOpenAI` serves both. Measured
 * 10.08.2026 through this exact wrapper, one tool-call round trip each:
 * Scaleway `mistral-medium-3.5-128b` 861 ms, GreenPT `gemma4` 2.4 s, both
 * emitting a well-formed tool call.
 *
 * ── No environment switches here, deliberately ────────────────────────────
 *
 * Which lane the worker runs on, and whether the lead delegates in parallel,
 * are research decisions with measurements behind them — not deployment
 * settings. An env knob would let a deployment pick a lane nobody measured, and
 * the failure mode is a thin report, which reads as the agent being weak rather
 * than as a setting being wrong. `DEEP_AGENT_WORKER` used to exist and is gone;
 * a deployment that still sets it is simply ignored (the schema strips unknown
 * keys), so nothing breaks on the way out.
 */

import { ChatOpenAI } from '@langchain/openai';

import { env } from '../../../config/env.js';
import { scalewayBaseUrl } from '../../ai/scalewayEndpoint.js';

/** Scaleway's name for Mistral Medium 3.5 — mirrors SCALEWAY_MISTRAL_MODELS. */
const SCALEWAY_MEDIUM = 'mistral-medium-3.5-128b';

/**
 * Gemma 4 26B-A4B on Scaleway — a MoE with 4B ACTIVE parameters, and the model
 * `INTERMEDIATE_LANES.heavy` already runs for the app's intermediate work.
 *
 * This is the same family as the GreenPT worker this replaces, on the host that
 * can actually switch the reasoning off (see `REASONING_OFF`). Measured for the
 * intermediate lane on 01.08.2026: roughly twice as fast as the dense 31B, 12/12
 * on a `max_tokens: 20` classification and 3/3 valid JSON on structured
 * extraction — i.e. it holds a tool-shaped contract, which is the property a
 * worker lives on here.
 */
const SCALEWAY_GEMMA = 'gemma-4-26b-a4b-it';

/**
 * Serial tool calls, for the lane that only ever uses tools one at a time.
 *
 * Asked for several at once, the Mistral lane intermittently emits one malformed
 * call whose `name` is the joined indices of the batch ("1,2,5"), which the API
 * rejects with a 400 (reproduced 10.08.2026). `sanitizeToolCallsMiddleware`
 * repairs the history afterwards, but a lane with nothing to gain from batching
 * should not pay for the repair at all.
 */
const SERIAL_TOOL_CALLS = { parallel_tool_calls: false } as const;

/**
 * Batched tool calls — the whole point of the lead's turn.
 *
 * The lead's expensive move is `task`, and issuing one `task` per turn makes the
 * subagents run strictly one after another. That is the single reason a full run
 * outlasts its own clock: the budget comments in `types.ts` note wall-clock as
 * THE binding constraint, and the 11.08.2026 run arrived at its deadline with 83
 * sources in hand and filed a `Teilbericht`. Delegating five sub-questions in
 * one turn costs the time of the slowest one, not the sum.
 *
 * The malformed-batch risk above is real and is why this is a considered choice
 * rather than a default: it is now ABSORBED rather than avoided. The sanitizer
 * cleans all three fields a bad call rides in (`tool_calls`,
 * `invalid_tool_calls`, `additional_kwargs.tool_calls` — the last of which was
 * the hole that let the 400 back onto the wire until 11.08.2026), nudges the
 * model back to serial calls, and bounds itself at `RETRY_LIMIT`. So a bad batch
 * costs a step; serial delegation costs the report.
 *
 * The prompt already assumes concurrency, incidentally: subagents answer in
 * their message instead of writing files precisely because parallel `task` calls
 * share one `files` state (see prompts.ts).
 */
const PARALLEL_TOOL_CALLS = { parallel_tool_calls: true } as const;

/**
 * Scaleway honours `reasoning_effort: 'none'`; GreenPT accepts and ignores it.
 *
 * That asymmetry is the entire reason the worker sits on Scaleway. GreenPT's
 * Gemma always emits a reasoning block (~5,400 characters, probed with
 * `enable_thinking:false`, `think:false` and `reasoning_effort:'none'` — all
 * accepted, none effective; the probes are recorded in `chat/agents/providers.ts`).
 * One block per step is affordable for a single answer and ruinous for a loop:
 * measured 10.08.2026 on the same question, the GreenPT worker produced no
 * report inside 500 s while the Scaleway worker finished the run in 156 s.
 *
 * Sent explicitly because this module builds its own `ChatOpenAI` and therefore
 * does NOT get `scalewayThinkingFetch`, which pins the same field at the
 * transport for the AI SDK side of the app.
 */
const REASONING_OFF = { reasoning_effort: 'none' } as const;

/**
 * The lead agent: plans, delegates, and writes the final report.
 *
 * Mistral Medium 3.5 because the run lives or dies on tool-calling discipline —
 * a lead that fumbles `task` or `write_file` produces no document at all.
 */
export function leadModel(): ChatOpenAI {
  return new ChatOpenAI({
    model: SCALEWAY_MEDIUM,
    apiKey: requireScalewayKey(),
    temperature: 0.3,
    configuration: { baseURL: scalewayBaseUrl() },
    modelKwargs: { ...PARALLEL_TOOL_CALLS },
  });
}

/**
 * The research subagent: one sub-question, a few searches, a short answer back.
 *
 * The small lane, and the one place where "use a cheaper model" actually pays
 * here — the worker does the overwhelming majority of the run's model calls
 * (every search, every read, every write-up), while the lead does a plan, a
 * handful of delegations and one report.
 *
 * It used to be `leadModel()` verbatim unless an env var named GreenPT, so in
 * practice both roles ran Mistral Medium: there was no cheap lane at all, only
 * the appearance of one. Gemma 26B-A4B keeps the worker on the host and family
 * that already work, with reasoning pinned off, and leaves the expensive lane to
 * the role that needs its tool discipline.
 *
 * Serial tool calls: a worker never delegates, so it has nothing to batch.
 */
export function workerModel(): ChatOpenAI {
  return new ChatOpenAI({
    model: SCALEWAY_GEMMA,
    apiKey: requireScalewayKey(),
    temperature: 0.3,
    configuration: { baseURL: scalewayBaseUrl() },
    modelKwargs: { ...SERIAL_TOOL_CALLS, ...REASONING_OFF },
  });
}

/** A missing key is a configuration fault and is the one thing a run may throw on. */
function requireScalewayKey(): string {
  const apiKey = env.SCALEWAY_API_KEY;
  if (!apiKey) throw new Error('SCALEWAY_API_KEY is required for the deep research agent');
  return apiKey;
}
