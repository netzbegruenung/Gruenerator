/**
 * User-facing catalog of the ChatGraph tools a user may enable on a custom
 * agent. The keys MUST match the ChatGraph tool registry
 * (`apps/api/agents/langgraph/ChatGraph/tools/registry.ts`).
 *
 * This is the single source of truth for:
 *   - the tool picker in the agent builder (labels + descriptions),
 *   - the agent-creator system prompt (it enumerates these capabilities),
 *   - server-side validation of an agent's `enabledTools` (the contract keeps
 *     the field a free string array — the closed set is enforced here, since
 *     `@gruenerator/contracts` is intentionally dependency-light and can't
 *     import this catalog).
 *
 * Internal/always-on tools (`memory`, `memory_save`, `self_review`,
 * `draft_structured`) are deliberately omitted — they are infrastructure the
 * user never toggles, not user-facing capabilities.
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
    key: 'web',
    label: 'Websuche',
    description: 'Sucht im Web nach aktuellen Informationen.',
  },
  {
    key: 'research',
    label: 'Tiefenrecherche',
    description: 'Führt eine mehrstufige Recherche mit Quellenangaben durch.',
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
] as const;

/** Just the keys, for membership checks. */
export const USER_SELECTABLE_TOOL_KEYS: readonly string[] = USER_SELECTABLE_TOOLS.map((t) => t.key);

/** Sensible default capabilities for a brand-new agent. */
export const DEFAULT_USER_AGENT_TOOLS: readonly string[] = ['search', 'web'];

/** Whether `key` is a tool a user is allowed to enable on a custom agent. */
export function isUserSelectableTool(key: string): boolean {
  return USER_SELECTABLE_TOOL_KEYS.includes(key);
}
