import { SKILL_CATEGORY_LABELS, type SkillCategory } from '@gruenerator/shared/agents';
import {
  PiDotsThreeOutline,
  PiFileText,
  PiGlobe,
  PiMagnifyingGlass,
  PiMegaphone,
  PiShareNetwork,
  PiSparkle,
  PiStar,
  PiStarFill,
  PiStorefront,
  PiUsersThree,
} from 'react-icons/pi';

import type { IconType } from 'react-icons';

export { SKILL_CATEGORY_LABELS };

/** Order the skill "aisles" are laid out in, both in the grid and the aisle nav. */
export const SKILL_CATEGORY_ORDER: SkillCategory[] = [
  'presse',
  'social',
  'dokumente',
  'recherche',
  'sonstiges',
];

/** Aisle sign icon per skill category. */
export const SKILL_CATEGORY_ICONS: Record<SkillCategory, IconType> = {
  presse: PiMegaphone,
  social: PiShareNetwork,
  dokumente: PiFileText,
  recherche: PiMagnifyingGlass,
  sonstiges: PiDotsThreeOutline,
};

/** Every category key the market can show. Skills + Landesverbände no longer have
 *  their own aisles — they live as sub-sections inside `gruenerator`. */
export type AgenturaCategoryKey =
  | 'empfohlen'
  | 'meine'
  | 'gruppen'
  | 'community'
  | 'gruenerator'
  | 'favoriten';

export interface AgenturaCategory {
  key: AgenturaCategoryKey;
  label: string;
  icon: IconType;
  /** Blurb shown under the main header for this category. */
  description: string;
  /** Copy + icon for the empty state (categories that stay visible when empty). */
  emptyText?: string;
  emptyIcon?: IconType;
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
    icon: PiStar,
    description: 'Beliebte Grüneratoren zum Einstieg — eine Auswahl über alle Regale hinweg.',
  },
  {
    key: 'meine',
    label: 'Meine Grüneratoren',
    icon: PiSparkle,
    description: 'Deine selbst erstellten Grüneratoren und wiederkehrenden Aufgaben.',
    emptyText:
      'Du hast noch keine eigenen Grüneratoren erstellt. Leg deinen ersten über „Neuer Grünerator" an.',
    emptyIcon: PiSparkle,
  },
  {
    key: 'gruppen',
    label: 'Geteilt mit Gruppen',
    icon: PiUsersThree,
    description: 'Grüneratoren, die in deinen Gruppen geteilt wurden.',
  },
  {
    key: 'community',
    label: 'Von der Basis',
    icon: PiGlobe,
    description: 'Öffentlich geteilte Grüneratoren von der Basis.',
    emptyText:
      'Noch keine öffentlichen Grüneratoren. Sei der oder die Erste — teile einen deiner Grüneratoren über „Teilen" und aktiviere „Von der Basis".',
    emptyIcon: PiGlobe,
  },
  {
    key: 'gruenerator',
    label: 'Offizielle Grüneratoren',
    icon: PiStorefront,
    description: 'Fertige Grüneratoren, Presse- & Social-Skills und Landesverbände von Grünerator.',
  },
  {
    key: 'favoriten',
    label: 'Favoriten',
    icon: PiStarFill,
    description: 'Deine gemerkten Grüneratoren und Skills.',
  },
];

export const DEFAULT_CATEGORY: AgenturaCategoryKey = 'empfohlen';

/** Sort options offered in the market header. */
export const SORT_VALUES = ['empfohlen', 'az'] as const;
export type AgenturaSort = (typeof SORT_VALUES)[number];

export const SORT_LABELS: Record<AgenturaSort, string> = {
  empfohlen: 'Empfohlen',
  az: 'A–Z',
};
