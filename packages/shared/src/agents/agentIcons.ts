/**
 * Agent icon keys.
 *
 * Two disjoint sets travel under the name `iconKey`:
 *
 * 1. **System agents** (`definitions/*.md`) name a platform-neutral concept in
 *    kebab-case (`bank`, `hand-heart`, …) — see `AGENT_ICON_KEYS` below.
 * 2. **User-created agents** store a react-icons **Phosphor** component name
 *    (e.g. `PiSparkle`). The picker (web) lets the user choose ANY Phosphor
 *    icon; this module only declares the curated subset the AI draft may
 *    suggest, and the default.
 *
 * No `react-icons` import here — this stays bundle-safe for the backend (the
 * name→component mapping lives frontend-side).
 */

/**
 * Die geschlossene Menge der Icon-Konzepte, die ein System-Agent im Frontmatter
 * benennen darf. Sie ist die einzige Quelle:
 *
 * - `build-agents.ts` (`detectUnknownIconKeys`) bricht ab, wenn eine
 *   `definitions/*.md` einen Schlüssel trägt, der hier nicht steht;
 * - die drei Plattform-Registries bilden sie als `Record<AgentIconKey, …>` ab,
 *   sodass der Compiler einen fehlenden Eintrag meldet:
 *     · `packages/chat/src/lib/agentIcons.ts`          (react-icons/pi)
 *     · `apps/web/…/Sidebar/sidebarAgentConfig.ts`     (react-icons/pi)
 *     · `apps/mobile/components/chat/sidebarIcons.ts`  (Ionicons)
 *
 * Ein neues Konzept ist damit eine Zeile hier plus drei in den Registries — und
 * der Compiler sagt, welche fehlt. Vorher war `iconKey` eine freie Zeichenkette
 * gegen drei handgepflegte, gegeneinander verdriftete Kopien; 7 von 19 Agenten
 * fielen still auf das Funkeln zurück (#2951).
 *
 * Bewusst ohne Import aus `@gruenerator/contracts`: `agents/` ist der einzige
 * Zweig von `packages/shared`, der gar keine Fremdpakete zieht, und die
 * Frontmatter-Prüfung findet ohnehin im Codegen statt, nicht auf der Leitung.
 */
export const AGENT_ICON_KEYS = [
  'sparkle',
  'megaphone',
  'buildings',
  'magnifying-glass',
  'chats-circle',
  'microphone',
  'book-open-text',
  'hand-heart',
  'file-text',
  'bird',
  'image',
  'image-square',
  'layout-grid',
  'table',
  'projector-screen-chart',
  'scales',
  'bank',
] as const;

export type AgentIconKey = (typeof AGENT_ICON_KEYS)[number];

export function isAgentIconKey(value: string): value is AgentIconKey {
  return (AGENT_ICON_KEYS as readonly string[]).includes(value);
}

/** The fallback icon name used when none is set or a name can't be resolved. */
export const DEFAULT_AGENT_ICON = 'PiSparkle';

/**
 * Curated, known-valid Phosphor names the AI draft is allowed to pick from.
 * Keeping the model on a closed set guarantees the synthesized `iconKey`
 * always resolves; the human picker is unrestricted.
 */
export const SUGGESTED_AGENT_ICONS = [
  'PiSparkle',
  'PiMegaphone',
  'PiNewspaper',
  'PiMagnifyingGlass',
  'PiChatsCircle',
  'PiBuildings',
  'PiTree',
  'PiLeaf',
  'PiUsersThree',
  'PiCalendarBlank',
  'PiImage',
  'PiGlobeSimple',
  'PiBookOpenText',
  'PiMicrophone',
  'PiHandHeart',
  'PiBird',
  'PiFileText',
  'PiLightbulb',
  'PiHeart',
  'PiRocketLaunch',
] as const;

export type SuggestedAgentIcon = (typeof SUGGESTED_AGENT_ICONS)[number];

export function isSuggestedAgentIcon(value: string): value is SuggestedAgentIcon {
  return (SUGGESTED_AGENT_ICONS as readonly string[]).includes(value);
}
