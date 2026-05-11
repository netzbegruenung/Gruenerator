export type AgentProvider = 'mistral' | 'anthropic' | 'litellm' | 'regolo';

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
  allowedCollections?: readonly string[];
  defaultCollection?: string;
  examplesCountry?: 'DE' | 'AT';
  examplesLvScope?: string | readonly string[];
  personSearchEnabled?: boolean;
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

export interface Agent {
  identifier: string;
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
  defaultNotebookId?: string;
  defaultFilter?: AgentDefaultFilter;
  /**
   * Hide this agent from agent-picker / inventory UIs. The identifier stays
   * live in the registry (so backend fallbacks and existing chat threads
   * keep resolving), but no UI surface offers it to the user. Used for
   * legacy or technical-fallback agents we don't want users to discover.
   */
  hiddenFromInventory?: boolean;
  /**
   * UI grouping bucket on AgentListPage. Currently only `'gruppen'` is defined
   * (the synthetic "shared with my groups" bucket, never assigned in config).
   * Additional categories will be added as the agent taxonomy stabilizes.
   */
  category?: AgentCategory;
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
  avatar: string;
  backgroundColor: string;
  mention: string;
  contextPrefix?: string;
  skillCategory?: SkillCategory;
  promptTemplate?: string;
  isSystemDefault?: boolean;
}
