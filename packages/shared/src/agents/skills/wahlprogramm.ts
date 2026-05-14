import type { SystemSkill } from './types.js';

export const WAHLPROGRAMM_SKILL = {
  identifier: 'gruenerator-wahlprogramm',
  title: 'Wahlprogramm',
  description: 'Programmkapitel',
  iconKey: 'PiListChecks',
  avatar: '📋',
  backgroundColor: '#316049',
  mention: 'wahlprogramm',
  skillCategory: 'dokumente',
} as const satisfies SystemSkill;
