import {
  type Agent,
  DEFAULT_USER_AGENT_TOOLS,
  DEFAULT_AGENT_ICON,
} from '@gruenerator/shared/agents';

export type Locale = 'de-DE' | 'de-AT';

export interface FormState {
  identifier: string;
  title: string;
  description: string;
  systemRole: string;
  /** Legacy emoji fallback; not shown in the UI (the icon picker drives the avatar). */
  avatar: string;
  /** react-icons Phosphor component name, e.g. `PiSparkle`. */
  iconKey: string;
  backgroundColor: string;
  locale: Locale;
  openingMessage: string;
  openingQuestions: string;
  enabledTools: string[];
  skillMentions: string[];
  defaultNotebookId: string; // '' = none
  tags: string;
  model: string;
  provider: 'mistral' | 'anthropic' | 'litellm' | 'regolo';
  maxTokens: number;
  temperature: number;
}

export const EMPTY_FORM: FormState = {
  identifier: '',
  title: '',
  description: '',
  systemRole: '',
  avatar: '✨',
  iconKey: DEFAULT_AGENT_ICON,
  backgroundColor: '#316049',
  locale: 'de-DE',
  openingMessage: '',
  openingQuestions: '',
  enabledTools: ['search', 'web'],
  skillMentions: [],
  defaultNotebookId: '',
  tags: '',
  model: 'mistral-large-latest',
  provider: 'mistral',
  maxTokens: 3000,
  temperature: 0.5,
};

/** Build the editable form state from a saved agent (edit / settings page). */
export function hydrateFormState(agent: Agent): FormState {
  return {
    identifier: agent.identifier,
    title: agent.title,
    description: agent.description,
    systemRole: agent.systemRole,
    avatar: agent.avatar,
    iconKey: agent.iconKey ?? DEFAULT_AGENT_ICON,
    backgroundColor: agent.backgroundColor,
    locale: agent.locale === 'de-AT' ? 'de-AT' : 'de-DE',
    openingMessage: agent.openingMessage,
    openingQuestions: agent.openingQuestions.join('\n'),
    // Fall back to defaults (not []) so a legacy agent with no enabledTools
    // doesn't silently narrow to zero tools.
    enabledTools: [...(agent.enabledTools ?? DEFAULT_USER_AGENT_TOOLS)],
    skillMentions: [...(agent.skillMentions ?? [])],
    defaultNotebookId: agent.defaultNotebookId ?? '',
    tags: agent.tags.join(', '),
    model: agent.model,
    provider: agent.provider,
    maxTokens: agent.params.max_tokens,
    temperature: agent.params.temperature,
  };
}
