import { SKILL_CATEGORY_LABELS, type SkillCategory } from '@gruenerator/shared/agents';
import {
  PiDotsThreeOutline,
  PiFileText,
  PiGlobe,
  PiMagnifyingGlass,
  PiMapPin,
  PiMegaphone,
  PiRepeat,
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

const SKILL_CATEGORY_DESCRIPTIONS: Record<SkillCategory, string> = {
  presse: 'Pressemitteilungen, Statements und O-Töne.',
  social: 'Posts, Captions und Community-Antworten.',
  dokumente: 'Anträge, Reden und andere Dokumente.',
  recherche: 'Recherche- und Analyse-Skills.',
  sonstiges: 'Weitere Skills für deinen Alltag.',
};

/** Every category key the market can show — fixed agent aisles plus the skill categories. */
export type AgenturaCategoryKey =
  | 'empfohlen'
  | 'meine'
  | 'wiederkehrend'
  | 'gruppen'
  | 'community'
  | 'gruenerator'
  | 'landesverbaende'
  | 'favoriten'
  | SkillCategory;

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
    description: 'Beliebte Agent*innen zum Einstieg — eine Auswahl über alle Regale hinweg.',
  },
  {
    key: 'meine',
    label: 'Meine Agent*innen',
    icon: PiSparkle,
    description: 'Deine selbst erstellten KI-Assistent*innen zum Chatten.',
    emptyText:
      'Du hast noch keine eigenen Agent*innen erstellt. Leg deine erste über „Neuer Agent" an.',
    emptyIcon: PiSparkle,
  },
  {
    key: 'wiederkehrend',
    label: 'Wiederkehrende Aufgaben',
    icon: PiRepeat,
    description: 'Lass eine*n Agent*in regelmäßig automatisch arbeiten (experimentell).',
    emptyText:
      'Noch keine wiederkehrenden Aufgaben. Erstelle eine oder frag im Chat: „Erstelle jeden Montag um 9 Uhr eine Zusammenfassung …“',
    emptyIcon: PiRepeat,
  },
  {
    key: 'gruppen',
    label: 'Geteilt mit Gruppen',
    icon: PiUsersThree,
    description: 'Agent*innen, die in deinen Gruppen geteilt wurden.',
  },
  {
    key: 'community',
    label: 'Von der Basis',
    icon: PiGlobe,
    description: 'Öffentlich geteilte Agent*innen von der Basis.',
    emptyText:
      'Noch keine öffentlichen Agent*innen. Sei der oder die Erste — teile eine*n deiner Agent*innen über „Teilen" und aktiviere „Von der Basis".',
    emptyIcon: PiGlobe,
  },
  {
    key: 'gruenerator',
    label: 'Grünerator-Agent*innen',
    icon: PiStorefront,
    description: 'Fertige Assistent*innen von Grünerator für deine Aufgaben.',
  },
  {
    key: 'landesverbaende',
    label: 'Landesverbände',
    icon: PiMapPin,
    description: 'Regionale Agent*innen und Skills deines Landesverbands.',
  },
  {
    key: 'favoriten',
    label: 'Favoriten',
    icon: PiStarFill,
    description: 'Deine gemerkten Agent*innen und Skills.',
  },
  ...SKILL_CATEGORY_ORDER.map(
    (cat): AgenturaCategory => ({
      key: cat,
      label: SKILL_CATEGORY_LABELS[cat],
      icon: SKILL_CATEGORY_ICONS[cat],
      description: SKILL_CATEGORY_DESCRIPTIONS[cat],
    })
  ),
];

export const DEFAULT_CATEGORY: AgenturaCategoryKey = 'empfohlen';

/** Sort options offered in the market header. */
export const SORT_VALUES = ['empfohlen', 'az'] as const;
export type AgenturaSort = (typeof SORT_VALUES)[number];

export const SORT_LABELS: Record<AgenturaSort, string> = {
  empfohlen: 'Empfohlen',
  az: 'A–Z',
};
