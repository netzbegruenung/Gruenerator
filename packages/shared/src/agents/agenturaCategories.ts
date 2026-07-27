import { type SkillCategory } from './types.js';

/**
 * The Agentura's shelves — the market's top-level categories.
 *
 * Identity only: key, label, description, and the order they are laid out in.
 * Icons deliberately do NOT live here. Web draws them with `react-icons`
 * (`IconType`), mobile with Ionicons; putting either in this file would pull a
 * rendering library into the other platform's bundle. Each app keeps its own
 * icon map keyed by `AgenturaCategoryKey`, so the compiler still catches a
 * shelf that nobody drew.
 *
 * `documentation/scripts/generate-agentura.mjs` parses this file by AST to
 * build the docs page, so the shape of the array literal is load-bearing:
 * keep the entries as plain object literals with string-literal values.
 */

/** Where a shelf exists. Omitted means web-only — the safe default, since a
 *  shelf reaches mobile only once someone builds it there. */
export type AgenturaPlatform = 'web' | 'mobile';

const BOTH: readonly AgenturaPlatform[] = ['web', 'mobile'];

/** Every category key the market can show. Skills + Landesverbände no longer have
 *  their own aisles — they live as sub-sections inside `gruenerator`. */
export type AgenturaCategoryKey =
  'empfohlen' | 'meine' | 'gruppen' | 'community' | 'gruenerator' | 'favoriten';

export interface AgenturaCategory {
  key: AgenturaCategoryKey;
  label: string;
  /** Blurb shown under the main header for this category. */
  description: string;
  /** Copy for the empty state (categories that stay visible when empty). */
  emptyText?: string;
  platforms?: readonly AgenturaPlatform[];
}

/**
 * Single source of truth for the market's categories, in sidebar/grid order. The
 * page filters this down to the categories that actually have items (see
 * `visibleCategories` in AgenturaPage) and drives both the sidebar and the main
 * header from it.
 */
export const AGENTURA_CATEGORIES: AgenturaCategory[] = [
  {
    key: 'empfohlen',
    label: 'Empfohlen',
    description: 'Beliebte Grüneratoren zum Einstieg — eine Auswahl über alle Regale hinweg.',
    platforms: BOTH,
  },
  {
    key: 'meine',
    label: 'Meine Grüneratoren',
    description: 'Deine selbst erstellten Grüneratoren und wiederkehrenden Aufgaben.',
    emptyText:
      'Du hast noch keine eigenen Grüneratoren erstellt. Leg deinen ersten über „Neuer Grünerator-Agent" an.',
    platforms: BOTH,
  },
  {
    key: 'gruppen',
    label: 'Geteilt mit Gruppen',
    description: 'Grüneratoren, die in deinen Gruppen geteilt wurden.',
  },
  {
    key: 'community',
    label: 'Von der Basis',
    description: 'Öffentlich geteilte Grüneratoren von der Basis.',
    emptyText:
      'Noch keine öffentlichen Grüneratoren. Sei der oder die Erste — teile einen deiner Grüneratoren über „Teilen" und aktiviere „Von der Basis".',
    platforms: BOTH,
  },
  {
    key: 'gruenerator',
    label: 'Offizielle Grüneratoren',
    description:
      'Fertige Grüneratoren, Presse- & Social-Rezepte und Landesverbände von Grünerator.',
    platforms: BOTH,
  },
  {
    key: 'favoriten',
    label: 'Favoriten',
    description: 'Deine gemerkten Grüneratoren und Rezepte.',
  },
];

export const DEFAULT_CATEGORY: AgenturaCategoryKey = 'empfohlen';

/** The shelves a given platform actually shows, in registry order. */
export function agenturaCategoriesForPlatform(platform: AgenturaPlatform): AgenturaCategory[] {
  return AGENTURA_CATEGORIES.filter((cat) => (cat.platforms ?? ['web']).includes(platform));
}

/** Order the skill "aisles" are laid out in, both in the grid and the aisle nav. */
export const SKILL_CATEGORY_ORDER: SkillCategory[] = [
  'presse',
  'social',
  'dokumente',
  'recherche',
  'sonstiges',
];

/** Sort options offered in the market header. */
export const SORT_VALUES = ['empfohlen', 'az'] as const;
export type AgenturaSort = (typeof SORT_VALUES)[number];

export const SORT_LABELS: Record<AgenturaSort, string> = {
  empfohlen: 'Empfohlen',
  az: 'A–Z',
};
