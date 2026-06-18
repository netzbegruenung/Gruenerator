import {
  type Agent,
  DEFAULT_USER_AGENT_TOOLS,
  DEFAULT_AGENT_ICON,
} from '@gruenerator/shared/agents';
import { TEXT_MODEL_BY_ID } from '@gruenerator/shared/models';

export type Locale = 'de-DE' | 'de-AT';

/** Agent avatars are always the brand "Eucalyptus" green (secondary-600). */
export const AGENT_BACKGROUND_COLOR = '#5F8575';

/** Default model for new agents — the chat composer's allrounder pick. */
const DEFAULT_AGENT_MODEL = TEXT_MODEL_BY_ID['mistral-medium-3.5'];

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
  /** Inject source URLs into the model context so links appear inline (e.g. emails). */
  inlineSourceLinks: boolean;
  defaultNotebookIds: string[];
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
  backgroundColor: AGENT_BACKGROUND_COLOR,
  locale: 'de-DE',
  openingMessage: '',
  openingQuestions: '',
  enabledTools: ['search', 'web'],
  skillMentions: [],
  inlineSourceLinks: false,
  defaultNotebookIds: [],
  tags: '',
  model: DEFAULT_AGENT_MODEL.model,
  provider: DEFAULT_AGENT_MODEL.provider,
  maxTokens: 3000,
  temperature: 0.5,
};

/**
 * Map the editable form state to the API payload shared by create (POST) and
 * edit (PATCH). The caller adds `identifier`/`author` for create; the partial
 * shape is a valid `UpdateUserAgentBody` for edit. `maxTokens` is no longer
 * user-editable — it rides through unchanged from `EMPTY_FORM`/`hydrateFormState`.
 */
export function formToPayload(form: FormState) {
  const openingQuestions = form.openingQuestions
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const tags = form.tags
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    title: form.title.trim(),
    description: form.description.trim(),
    systemRole: form.systemRole.trim(),
    avatar: form.avatar.trim() || '✨',
    iconKey: form.iconKey,
    backgroundColor: AGENT_BACKGROUND_COLOR,
    tags,
    model: form.model,
    provider: form.provider,
    params: { max_tokens: form.maxTokens, temperature: form.temperature },
    openingMessage: form.openingMessage,
    openingQuestions,
    locale: form.locale,
    enabledTools: form.enabledTools,
    skillMentions: form.skillMentions,
    inlineSourceLinks: form.inlineSourceLinks,
    defaultNotebookIds: form.defaultNotebookIds,
  };
}

/** Build the editable form state from a saved agent (edit / settings page). */
export function hydrateFormState(agent: Agent): FormState {
  return {
    identifier: agent.identifier,
    title: agent.title,
    description: agent.description,
    systemRole: agent.systemRole,
    avatar: agent.avatar,
    iconKey: agent.iconKey ?? DEFAULT_AGENT_ICON,
    backgroundColor: AGENT_BACKGROUND_COLOR,
    locale: agent.locale === 'de-AT' ? 'de-AT' : 'de-DE',
    openingMessage: agent.openingMessage,
    openingQuestions: agent.openingQuestions.join('\n'),
    // Fall back to defaults (not []) so a legacy agent with no enabledTools
    // doesn't silently narrow to zero tools.
    enabledTools: [...(agent.enabledTools ?? DEFAULT_USER_AGENT_TOOLS)],
    skillMentions: [...(agent.skillMentions ?? [])],
    inlineSourceLinks: agent.inlineSourceLinks ?? false,
    defaultNotebookIds: agent.defaultNotebookIds ? [...agent.defaultNotebookIds] : [],
    tags: agent.tags.join(', '),
    model: agent.model,
    provider: agent.provider,
    maxTokens: agent.params.max_tokens,
    temperature: agent.params.temperature,
  };
}
