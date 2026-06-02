/**
 * Agent icon keys.
 *
 * User-created agents store a react-icons **Phosphor** component name (e.g.
 * `PiSparkle`) in their `iconKey`. The picker (web) lets the user choose ANY
 * Phosphor icon; this module only declares the curated subset the AI draft may
 * suggest and the default. No `react-icons` import here — this stays bundle-safe
 * for the backend (the name→component mapping lives frontend-side).
 */

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
