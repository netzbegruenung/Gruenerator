/**
 * The one door between an agent's `enabledTools` ARRAY and the per-request
 * `enabledTools` RECORD the pipeline gates on.
 *
 * The two never met (#3299): the agent builder stores a `string[]` of picker
 * keys (`USER_SELECTABLE_TOOL_KEYS`), while every gate reads
 * `state.enabledTools?.[key] !== false` on a record the client builds from its
 * composer toggles. Unchecking "Formulare ausfüllen" on a custom agent
 * therefore took nothing away. `applyAgentToolWhitelist` closes that gap at
 * `initializeChatState` by writing an explicit `false` for every closed-set key
 * the agent did not choose — explicit, because `!== false` treats an absent key
 * as enabled.
 *
 * Two vocabularies share the array and both are honoured here: the picker keys
 * the builder writes, and the raw tool names the system/editor agents declare in
 * frontmatter (`web_search`, `scrape_url`, …). `agentAllowsWebSearch` and the
 * classifier's scrape gate delegate to `agentAllowsTool`, so there is one
 * reading of the array, not three.
 *
 * Only user-created agents are whitelisted (`shouldApplyAgentToolWhitelist`).
 * The system agents' arrays were curated while only web/scrape gated anything;
 * binding them would strip Wolke, PDF forms and thread search from the editor
 * and LV agents. Decided 15.09.2026, see the issue.
 */

import { USER_SELECTABLE_TOOL_KEYS } from '@gruenerator/shared/agents';

import type { AgentConfig } from './types.js';

/**
 * Raw tool names system/editor agents declare → the picker key that gates the
 * same capability. Values must stay inside `USER_SELECTABLE_TOOL_KEYS` (pinned
 * by the test).
 */
export const RAW_TOOL_NAME_TO_PICKER_KEY: Readonly<Record<string, string>> = {
  web_search: 'web',
  scrape_url: 'scrape',
  generate_image: 'image',
  edit_image: 'image_edit',
  analyze_image: 'vision',
  gruenerator_search: 'search',
  gruenerator_examples_search: 'examples',
  find_content: 'user_content',
};

/**
 * Picker keys that are ONE capability behind two names: declaring any member
 * grants all. `research` was merged into the "Recherche" picker entry stored
 * under `web`; older agents still carry `research` (BACKWARD_COMPAT_TOOL_KEYS).
 */
const CAPABILITY_GROUPS: readonly (readonly string[])[] = [['web', 'research']];

type ToolDeclaration = Pick<AgentConfig, 'enabledTools'>;

/**
 * The picker keys an agent allows, or `null` when it declares nothing at all —
 * absence is "not configured", not "nothing allowed"; the universal agent and
 * legacy user agents rely on that. An empty array IS "nothing allowed".
 */
export function resolveAgentToolKeys(agentConfig: ToolDeclaration): ReadonlySet<string> | null {
  const declared = agentConfig.enabledTools;
  if (!declared) return null;
  const keys = new Set(declared.map((key) => RAW_TOOL_NAME_TO_PICKER_KEY[key] ?? key));
  for (const group of CAPABILITY_GROUPS) {
    if (group.some((key) => keys.has(key))) group.forEach((key) => keys.add(key));
  }
  return keys;
}

/** May this agent use the capability behind picker key `key`? */
export function agentAllowsTool(agentConfig: ToolDeclaration, key: string): boolean {
  const keys = resolveAgentToolKeys(agentConfig);
  return keys === null || keys.has(key);
}

/**
 * Narrows the per-request record to what the agent allows. Writes `false` for
 * every closed-set key the agent did not choose and nothing else: a request
 * `false` (composer toggle) survives, a key the agent allows but the request
 * omits stays absent, and keys outside `USER_SELECTABLE_TOOL_KEYS` (editor
 * surfaces, intent names, loop-internal tools) pass through verbatim.
 */
export function applyAgentToolWhitelist(
  agentConfig: ToolDeclaration,
  requestEnabledTools: Record<string, boolean>
): Record<string, boolean> {
  const keys = resolveAgentToolKeys(agentConfig);
  if (keys === null) return requestEnabledTools;
  const out: Record<string, boolean> = { ...requestEnabledTools };
  for (const key of USER_SELECTABLE_TOOL_KEYS) {
    if (!keys.has(key)) out[key] = false;
  }
  return out;
}

/** Whether the whitelist binds this agent — user-created agents only. */
export function shouldApplyAgentToolWhitelist(
  agentConfig: Pick<AgentConfig, 'isUserAgent'>
): boolean {
  return agentConfig.isUserAgent === true;
}
