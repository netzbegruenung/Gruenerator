/**
 * User-facing catalog of the chat tools a user may enable on a custom
 * agent. The keys MUST match the `enabledTools` keys the chat pipeline
 * understands (`intentExecutionService.ts` / `ToolKey` in
 * `packages/chat/src/stores/chatStore.ts`).
 *
 * This is the single source of truth for:
 *   - the tool picker in the agent builder (labels + descriptions),
 *   - the agent-creator system prompt (it enumerates these capabilities),
 *   - server-side validation of an agent's `enabledTools` (the contract keeps
 *     the field a free string array — the closed set is enforced here, since
 *     `@gruenerator/contracts` is intentionally dependency-light and can't
 *     import this catalog).
 *
 * Internal/always-on tools (`memory`, `memory_save`) are deliberately
 * omitted — they are infrastructure the user never toggles, not user-facing
 * capabilities.
 */

export interface UserSelectableTool {
  /** Registry key passed through to `enabledTools`. */
  key: string;
  /** Short label for the picker. */
  label: string;
  /** One-line explanation of the capability. */
  description: string;
}

export const USER_SELECTABLE_TOOLS: readonly UserSelectableTool[] = [
  {
    key: 'search',
    label: 'Grünerator-Wissen',
    description:
      'Durchsucht die Grünerator-Wissensdatenbank (Programme, Beschlüsse, Kommunalwiki).',
  },
  {
    // Merged search tool (formerly "Websuche" + "Tiefenrecherche"). One picker
    // entry; the backend auto-scales depth (fast web ↔ deep multi-source
    // research) by query complexity. Stored under the legacy `web` key for
    // back-compat with existing agents (default has always been ['search','web']);
    // `research` stays a recognized key (see BACKWARD_COMPAT_TOOL_KEYS) and the
    // backend treats the two as one capability (see `isToolEnabled`).
    key: 'web',
    label: 'Recherche',
    description:
      'Sucht im Web und führt bei Bedarf eine tiefere Mehrquellen-Recherche mit Quellenangaben durch. Die Suchtiefe wird automatisch gewählt.',
  },
  {
    key: 'examples',
    label: 'Social-Media-Beispiele',
    description: 'Findet passende Beispiel-Posts aus dem Grünerator-Fundus.',
  },
  {
    key: 'image',
    label: 'Bildgenerierung',
    description: 'Erstellt Bilder aus einer Beschreibung.',
  },
  {
    key: 'image_edit',
    label: 'Bildbearbeitung',
    description: 'Bearbeitet ein vorhandenes Bild nach Anweisung.',
  },
  {
    key: 'vision',
    label: 'Bildanalyse',
    description: 'Beschreibt und analysiert hochgeladene Bilder.',
  },
  {
    key: 'scrape',
    label: 'Webseiten lesen',
    description: 'Liest den Inhalt einer angegebenen URL aus.',
  },
  {
    key: 'meinungsbild',
    label: 'Umfragen',
    description: 'Ruft aktuelle Umfragewerte ab.',
  },
  {
    key: 'user_content',
    label: 'Eigene Inhalte',
    description: 'Durchsucht die eigenen gespeicherten Texte und Dokumente.',
  },
  {
    key: 'search_threads',
    label: 'Frühere Chats',
    description:
      'Durchsucht frühere Unterhaltungen — im aktuellen Space oder über alle Chats hinweg.',
  },
] as const;

/**
 * Keys that are no longer shown in the picker but stay VALID so existing agent
 * configs aren't stripped by server-side validation. `research` was merged into
 * the single "Recherche" tool (stored under `web`); both keys still gate the
 * merged search capability (see `isToolEnabled` in the ChatGraph system prompt).
 */
export const BACKWARD_COMPAT_TOOL_KEYS: readonly string[] = ['research'];

/** Just the keys, for membership checks (picker keys + back-compat keys). */
export const USER_SELECTABLE_TOOL_KEYS: readonly string[] = [
  ...USER_SELECTABLE_TOOLS.map((t) => t.key),
  ...BACKWARD_COMPAT_TOOL_KEYS,
];

/** Sensible default capabilities for a brand-new agent. */
export const DEFAULT_USER_AGENT_TOOLS: readonly string[] = ['search', 'web'];

/** Whether `key` is a tool a user is allowed to enable on a custom agent. */
export function isUserSelectableTool(key: string): boolean {
  return USER_SELECTABLE_TOOL_KEYS.includes(key);
}
