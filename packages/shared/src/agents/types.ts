import type { ComponentType } from 'react';

export type AgentProvider = 'mistral' | 'anthropic' | 'litellm' | 'regolo';

export type SkillIcon = ComponentType<{ className?: string }>;

export interface AgentParams {
  max_tokens: number;
  temperature: number;
}

export interface FewShotExample {
  input: string;
  output: string;
  reasoning?: string;
}

export interface ToolRestrictions {
  /**
   * Single canonical definition shared by `apps/api` (under
   * `exactOptionalPropertyTypes: true`) and the web/shared callers. Each field
   * is explicitly `T | undefined` so spread assignments from objects whose
   * properties may be `undefined` type-check on both sides.
   */
  allowedCollections?: readonly string[] | undefined;
  defaultCollection?: string | undefined;
  examplesCountry?: 'DE' | 'AT' | undefined;
  personSearchEnabled?: boolean | undefined;
  /**
   * Per-Landesverband scope for press/social examples. Accepts a single short
   * code (e.g. 'BE') or an array (e.g. ['BE', 'BE-F']) when the LV publishes
   * under multiple codes (Berlin & Thüringen carry both Landesverband and
   * Fraktion). Press filters via Qdrant `landesverband` field; social
   * currently logs only (Apify follow-up will add the field to social_media_examples).
   */
  examplesLvScope?: string | readonly string[] | undefined;
  /**
   * When set, `search_examples` queries this Qdrant collection name instead
   * of the default `social_media_examples`. Used by per-person tweet-style
   * agents (e.g. "Tweet wie Ricarda" → `ricarda_lang_tweets`) so the few-shot
   * grounding comes from that person's tweets only.
   */
  examplesCollection?: string | undefined;
}

/**
 * Hard-pinned filters merged into tool calls (Qdrant filter / examples service).
 * Invisible to the LLM — applied server-side in directSearchExecutors.
 * Used for LV-scoped agents so e.g. the Berlin agent always cites Berlin sources
 * regardless of what (if anything) the model passes as filter arguments.
 */
export interface AgentDefaultFilter {
  /** Landesverband shortName(s), e.g. 'BE' or ['BE', 'BE-F']. */
  landesverband?: readonly string[] | string;
}

/**
 * Which user-locale audience an agent is meant for.
 * - `'de-DE'` — only German users see it (Landesverband PR agents, German-only
 *   persona agents, anything tied to Bundestag / German LV substrates).
 * - `'de-AT'` — only Austrian users see it (none yet at the time of writing).
 * - `'all'` — visible to everyone; the agent itself adapts to `userLocale`
 *   (e.g. system prompt forks via `LÄNDERKONTEXT: ÖSTERREICH` for AT users).
 * - `undefined` — treated as `'all'` for backward compatibility.
 */
export type AgentAudience = 'de-DE' | 'de-AT' | 'all';

/**
 * Per-locale UI override bundle. Fields here win over the agent's top-level
 * defaults when a matching user locale resolves the agent. Used for agents
 * marked `audience: 'all'` that want to swap welcome copy, opening questions,
 * or description text per locale without forking into two registry entries.
 */
export interface AgentLocalization {
  title?: string;
  description?: string;
  openingMessage?: string;
  welcomeQuestion?: string;
  openingQuestions?: readonly string[];
}

export interface Agent {
  identifier: string;
  /**
   * Optional URL slug override. When set, `/agents/<slug>` resolves here and
   * link-builders emit this instead of the `gruenerator-`-stripped identifier.
   * The derived slug stays a working alias, so old links never break. Used for
   * agents whose derived slug is unwieldy (`oeffentlichkeitsarbeit-mecklenburg-vorpommern`).
   */
  slug?: string;
  title: string;
  description: string;
  systemRole: string;
  avatar: string;
  backgroundColor: string;
  tags: readonly string[];
  model: string;
  defaultModel?: string;
  provider: AgentProvider;
  params: AgentParams;
  openingMessage: string;
  /**
   * Friendly question rendered as the WelcomeScreen heading before the user
   * sends their first message. May contain the `{firstName}` token to
   * personalize. When omitted, the screen falls back to a generic
   * "Hallo {firstName}, wie kann ich helfen?" greeting.
   */
  welcomeQuestion?: string;
  openingQuestions: readonly string[];
  locale: string;
  author: string;
  plugins?: readonly string[];
  toolRestrictions?: ToolRestrictions;
  enabledTools?: readonly string[];
  fewShotExamples?: readonly FewShotExample[];
  routeTo?: 'chat' | 'search';
  defaultFilter?: AgentDefaultFilter;
  /**
   * Hide this agent from agent-picker / inventory UIs. The identifier stays
   * live in the registry (so backend fallbacks and existing chat threads
   * keep resolving), but no UI surface offers it to the user. Used for
   * legacy or technical-fallback agents we don't want users to discover.
   */
  hiddenFromInventory?: boolean;
  /**
   * Notebook ID this agent auto-selects when the user opens its chat
   * (`ChatPage` calls `setSelectedNotebook` with this on agent activation).
   * Used by the per-LV PR agents so the regional notebook pairs with the
   * regional agent without an extra click. Set by the LV-spec generator
   * in `system.ts`; absent on hand-written entries.
   */
  defaultNotebookId?: string;
  /**
   * Routing hint for the "Automatisch" model picker. Read by the frontend
   * resolver (`resolveAutoModel`) to map this agent to a context-appropriate
   * model without hand-curating ID lists. `'creative'` → Gemma 4 today;
   * `'precise'` → Mistral (strong instruction-following, e.g. the agent
   * creator); `'research'` is reserved for a future bucket.
   */
  autoRoutingHint?: 'creative' | 'precise' | 'research';
  /**
   * System skill `mention` strings (e.g. `'presse'`, `'antrag'`) surfaced as
   * clickable quick-starts on this agent's chat landing. Each resolves via
   * `resolveSkillMention` to the skill's `promptTemplate`, which is inserted
   * into the composer on click. Set by the agent creator / builder; absent on
   * hand-written system entries (which use `openingQuestions` instead).
   */
  skillMentions?: readonly string[];
  /**
   * Frontend icon registry key. Maps to a `react-icons` component in
   * `apps/web/src/components/layout/Sidebar/sidebarAgentConfig.ts::ICON_REGISTRY`.
   * Per-LV `gruenerator-oeffentlichkeitsarbeit-*` agents inherit the megaphone
   * via prefix special-case, so they need no `iconKey` of their own.
   */
  iconKey?: string;
  /**
   * Surfaces this agent as a pinned entry in the web sidebar (always visible,
   * separate from user favorites). Label and icon come from the agent's
   * `title` and `iconKey` respectively — set both before flipping this on.
   * Used to derive `DEFAULT_AGENT_ENTRIES` and `PINNED_AGENT_IDS` so adding a
   * new pinned agent is a single edit in the agent definition.
   */
  pinnedToSidebar?: boolean;
  /**
   * UI grouping bucket on AgentListPage. Currently only `'gruppen'` is defined
   * (the synthetic "shared with my groups" bucket, never assigned in config).
   * Additional categories will be added as the agent taxonomy stabilizes.
   */
  category?: AgentCategory;
  /**
   * Which user-locale audience this agent is meant for. Governs sidebar /
   * inventory visibility — backend can still resolve the agent by identifier
   * regardless (for direct URL access or legacy thread reconstruction).
   * See `AgentAudience` for the semantics; undefined ≈ `'all'`.
   */
  audience?: AgentAudience;
  /**
   * Optional per-locale overrides applied by `localizeAgent(agent, locale)`.
   * Useful for `audience: 'all'` agents that should swap title / opening
   * copy per user locale without forking into two registry entries.
   */
  localized?: Partial<Record<'de-DE' | 'de-AT', AgentLocalization>>;
  /**
   * When true, the source URLs of search hits are injected into the model's
   * text context, so the agent can write concrete article links inline into
   * its answer (e.g. ready-to-send emails/letters whose copied text doesn't
   * carry the chat UI's clickable `[N]` source cards). Default off — normal
   * chat relies on the `[N]` cards instead. Read by the ChatGraph respond node.
   */
  inlineSourceLinks?: boolean;
}

export type AgentCategory = 'gruppen';

export const AGENT_CATEGORY_LABELS: Record<AgentCategory, string> = {
  gruppen: 'Geteilt mit Gruppen',
};

export type SkillCategory = 'presse' | 'social' | 'dokumente' | 'recherche' | 'sonstiges';

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  presse: 'Presse & Kommunikation',
  social: 'Social Media',
  dokumente: 'Dokumente & Texte',
  recherche: 'Recherche & Analyse',
  sonstiges: 'Sonstiges',
};

export interface Skill {
  identifier: string;
  title: string;
  description: string;
  iconKey: string;
  icon?: SkillIcon;
  avatar: string;
  backgroundColor: string;
  mention: string;
  skillCategory?: SkillCategory;
  promptTemplate?: string;
  isSystemDefault?: boolean;
  skillSystemPrompt?: string;
  /** Locale visibility, same semantics as `AgentAudience` on agents. Undefined ≈ `'all'`. */
  audience?: AgentAudience;
}
