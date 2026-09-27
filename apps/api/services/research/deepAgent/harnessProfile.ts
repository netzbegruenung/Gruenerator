/**
 * Turns off the `general-purpose` subagent `deepagents` adds by itself.
 *
 * `createDeepAgent` ships a second delegation target unless it is told not to,
 * and providing our own subagents does NOT replace it — the built-in one is
 * only skipped when a subagent of exactly that name is supplied
 * (`!inlineSubagents.some((item) => item.name === GENERAL_PURPOSE_SUBAGENT.name)`,
 * `deepagents@1.12.2`, `dist/langsmith-b3Dpu8rS.js:5847`). Ours are called
 * `recherche` and so on, so the run had two of them, and the second one
 *
 *  - runs on the LEAD model instead of the cheap worker lane,
 *  - carries the generic `DEFAULT_SUBAGENT_PROMPT` — no notebook-first rule, no
 *    "read two or three hits", no `## Quellen` block, no Austria context,
 *  - and advertises itself as a "General-purpose agent for researching complex
 *    questions … has access to all tools as the main agent".
 *
 * A research lead can plausibly reach for that, and then everything the
 * specialised subagent exists for silently does not happen.
 *
 * There is no `generalPurposeAgent` flag on `createDeepAgent` in this version —
 * the option lives on `createSubAgentMiddleware`, which `createDeepAgent` calls
 * itself with `generalPurposeAgent: false` after deciding the question from the
 * HARNESS PROFILE it looked up for the model. So the profile is the seam.
 *
 * Profiles are keyed by provider (`ChatOpenAI` → `openai`) with a
 * `provider:model` lookup taking precedence; registering the bare provider key
 * covers both our lanes, which are the only `deepagents` models in this repo.
 * The registry is global and the call is idempotent, so it runs per run rather
 * than as an import side effect.
 */

import { registerHarnessProfile } from 'deepagents';

/** `getModelProvider` maps our `ChatOpenAI` lanes to this key. */
export const HARNESS_PROFILE_KEY = 'openai';

export function suppressGeneralPurposeSubagent(): void {
  registerHarnessProfile(HARNESS_PROFILE_KEY, {
    generalPurposeSubagent: { enabled: false },
  });
}
