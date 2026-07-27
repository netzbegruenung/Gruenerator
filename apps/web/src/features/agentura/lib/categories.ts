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

import type { AgenturaCategoryKey, SkillCategory } from '@gruenerator/shared/agents';
import type { IconType } from 'react-icons';

/**
 * Web's icon layer over the shared shelf registry.
 *
 * The shelves themselves — key, label, description, order — live in
 * `@gruenerator/shared/agents` so that mobile and the docs generator can read
 * them. Only the `react-icons` bindings stay here: they are web-only by
 * construction, and shipping `IconType` through shared would drag react-icons
 * into the Metro bundle.
 */
export {
  AGENTURA_CATEGORIES,
  DEFAULT_CATEGORY,
  SKILL_CATEGORY_LABELS,
  SKILL_CATEGORY_ORDER,
  SORT_LABELS,
  SORT_VALUES,
  type AgenturaCategory,
  type AgenturaCategoryKey,
  type AgenturaSort,
} from '@gruenerator/shared/agents';

/** Aisle sign icon per skill category. */
export const SKILL_CATEGORY_ICONS: Record<SkillCategory, IconType> = {
  presse: PiMegaphone,
  social: PiShareNetwork,
  dokumente: PiFileText,
  recherche: PiMagnifyingGlass,
  sonstiges: PiDotsThreeOutline,
};

/** Shelf sign icon per category. A `Record`, not a lookup with a fallback: a new
 *  shelf in the shared registry then fails to compile here until it has an icon. */
export const AGENTURA_CATEGORY_ICONS: Record<AgenturaCategoryKey, IconType> = {
  empfohlen: PiStar,
  meine: PiSparkle,
  gruppen: PiUsersThree,
  community: PiGlobe,
  gruenerator: PiStorefront,
  favoriten: PiStarFill,
};

/** Icon for a shelf's empty state — only the shelves that stay visible when
 *  empty carry `emptyText`, so the others never reach this map. */
export const AGENTURA_EMPTY_ICONS: Partial<Record<AgenturaCategoryKey, IconType>> = {
  meine: PiSparkle,
  community: PiGlobe,
};
