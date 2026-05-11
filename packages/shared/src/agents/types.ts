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
  openingQuestions: readonly string[];
  locale: string;
  author: string;
  plugins?: readonly string[];
  toolRestrictions?: ToolRestrictions;
  enabledTools?: readonly string[];
  fewShotExamples?: readonly FewShotExample[];
  routeTo?: 'chat' | 'search';
  defaultFilter?: AgentDefaultFilter;
}

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
