import { USER_SELECTABLE_TOOL_KEYS } from './userTools.js';

/**
 * Closed set of keys a system agent's `enabledTools` may declare. User-created
 * agents are validated against this set server-side (agentDraftService.ts);
 * system agents come from markdown frontmatter (definitions/*.md, codegen'd
 * into index.generated.ts) and the Landesverband template registries
 * (lvPrAgents.ts & co.) and had no validation seam at all — `draft_structured`
 * and `self_review` sat in 19 definitions until #3078.
 *
 * What gates at runtime (apps/api/routes/chat/agents/agentToolWhitelist.ts):
 *   - For USER-CREATED agents every `USER_SELECTABLE_TOOL_KEYS` entry —
 *     `applyAgentToolWhitelist` (ChatGraph `initializeChatState`) writes an
 *     explicit `false` into the per-request `enabledTools` record for each
 *     picker key the agent did not choose.
 *   - For SYSTEM agents only `web` / `research` / `web_search` (agentAllowsWebSearch
 *     in searchTools.ts, board flow via enabledToolKeys) and `scrape` /
 *     `scrape_url` (classifierNode scrape gate); `examples` and `search` also
 *     steer the board flow. Their arrays are deliberately NOT whitelisted.
 *   - Raw tool names alias onto picker keys (`RAW_TOOL_NAME_TO_PICKER_KEY`:
 *     `web_search`→`web`, `scrape_url`→`scrape`, `generate_image`→`image`, …);
 *     `web` and `research` are one capability.
 * The rest are metadata (memory infrastructure, intent vocabulary, editor-
 * surface keys). They must still name real capabilities — a key for a tool that
 * does not exist is visible to end users (agentura detail page lists the raw
 * keys) and can leak into the few-shot prose that reaches the model (system
 * agents' `fewShotExamples` flow into the MCP prompt, see agentPrompts.ts).
 */
export const AGENT_TOOL_KEYS: readonly string[] = [
  ...USER_SELECTABLE_TOOL_KEYS,
  // Internal memory infrastructure — always on, never user-toggleable
  // (deliberately omitted from the picker, see userTools.ts header).
  'memory',
  'memory_save',
  // Raw tool names the editor agents declare in frontmatter (see the
  // two-vocabulary note in searchTools.ts). `web_search` gates web access,
  // `scrape_url` gates scraping.
  'web_search',
  'scrape_url',
  'gruenerator_search',
  'gruenerator_examples_search',
  'summarize',
  'find_content',
  'recall_memory',
  'save_memory',
  'save_as_doc',
  'generate_image',
  'edit_image',
  'analyze_image',
  // Editor-surface keys, read from the per-request `enabledTools` record
  // (agenticLoop/routing.ts), declared by the editor agents.
  'edit_current_doc',
  'edit_current_board',
  // Classifier intent names, not tools: the LV-PR agents carry
  // `pressemitteilung_examples`, the corpus agents their corpus intents.
  'pressemitteilung_examples',
  'abgeordnetenwatch',
  'bundestag',
];

/** Whether `key` is a known system-agent `enabledTools` key. */
export function isAgentToolKey(key: string): boolean {
  return AGENT_TOOL_KEYS.includes(key);
}
