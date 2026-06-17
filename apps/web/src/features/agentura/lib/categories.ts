import { SKILL_CATEGORY_LABELS, type SkillCategory } from '@gruenerator/shared/agents';
import {
  PiDotsThreeOutline,
  PiFileText,
  PiGlobe,
  PiMagnifyingGlass,
  PiMapPin,
  PiMegaphone,
  PiShareNetwork,
  PiSparkle,
  PiStar,
  PiStorefront,
  PiUsersThree,
} from 'react-icons/pi';

import type { IconType } from 'react-icons';

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

/** Stable DOM id for a skill-category section, used by the aisle nav to scroll-jump. */
export function skillCategorySectionId(cat: SkillCategory): string {
  return `aisle-${cat}`;
}

export { SKILL_CATEGORY_LABELS };

/** Fixed (non-skill-category) sections, in render order. Icons double as aisle signs. */
export const AGENT_SECTIONS = {
  meine: { id: 'aisle-meine', label: 'Meine Agent*innen', icon: PiSparkle },
  gruppen: { id: 'aisle-gruppen', label: 'Geteilt mit Gruppen', icon: PiUsersThree },
  community: { id: 'aisle-community', label: 'Von der Basis', icon: PiGlobe },
  gruenerator: { id: 'aisle-gruenerator', label: 'Grünerator-Agent*innen', icon: PiStorefront },
  landesverbaende: { id: 'aisle-landesverbaende', label: 'Landesverbände', icon: PiMapPin },
  favoriten: { id: 'aisle-favoriten', label: 'Favoriten', icon: PiStar },
} as const;
