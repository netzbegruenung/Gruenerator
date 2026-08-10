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
 */

import { ChatOpenAI } from '@langchain/openai';

import { env } from '../../../config/env.js';
import { GREENPT_BASE_URL } from '../../ai/providerInstances.js';
import { scalewayBaseUrl } from '../../ai/scalewayEndpoint.js';

/** Scaleway's name for Mistral Medium 3.5 — mirrors SCALEWAY_MISTRAL_MODELS. */
const SCALEWAY_MEDIUM = 'mistral-medium-3.5-128b';

/** GreenPT's Gemma 4 (26B). Same weights as the Scaleway lane's small sibling. */
const GREENPT_GEMMA = 'gemma4';

/**
 * The lead agent: plans, delegates, and writes the final report.
 *
 * Mistral Medium 3.5 because the run lives or dies on tool-calling discipline —
 * a lead that fumbles `task` or `write_file` produces no document at all.
 */
export function leadModel(): ChatOpenAI {
  const apiKey = env.SCALEWAY_API_KEY;
  if (!apiKey) throw new Error('SCALEWAY_API_KEY is required for the deep research agent');
  return new ChatOpenAI({
    model: SCALEWAY_MEDIUM,
    apiKey,
    temperature: 0.3,
    configuration: { baseURL: scalewayBaseUrl() },
    // Parallel tool calls OFF. Asked for several at once, this lane
    // intermittently emits one malformed call whose `name` is the joined
    // indices of the batch ("1,2,5"), which the API rejects with a 400 and the
    // run dies mid-way (reproduced 10.08.2026 on a four-part plan). Serial
    // delegation costs wall-clock we have budget for; a 400 costs the report.
    modelKwargs: { parallel_tool_calls: false },
  });
}

/**
 * The research subagent: one sub-question, a few searches, a short answer back.
 *
 * Also the Scaleway lane — and that is a measurement, not a preference. Gemma 4
 * on GreenPT is the cheaper and greener host and was the intended lane here, but
 * it ALWAYS emits a reasoning block that no flag suppresses (~5,400 characters;
 * `providers.ts` records the probes that established this). One such block per
 * agent step is affordable for a single answer and ruinous for a loop: measured
 * 10.08.2026 on the same question, the GreenPT worker produced no report inside
 * 500 s, while the Scaleway worker finished the full run in 156 s.
 *
 * Kept reachable behind `DEEP_AGENT_WORKER=greenpt` so the comparison can be
 * re-run when that endpoint gains a thinking switch — at which point it should
 * become the default again.
 */
export function workerModel(): ChatOpenAI {
  const apiKey = env.GREENPT_API_KEY;
  if (!apiKey || process.env.DEEP_AGENT_WORKER !== 'greenpt') return leadModel();
  return new ChatOpenAI({
    model: GREENPT_GEMMA,
    apiKey,
    temperature: 0.3,
    configuration: { baseURL: GREENPT_BASE_URL },
    modelKwargs: { parallel_tool_calls: false },
  });
}
