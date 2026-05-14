import type { SystemSkill } from './types.js';

export const SOCIAL_MV_SKILL = {
  identifier: 'gruenerator-oeffentlichkeitsarbeit-mecklenburg-vorpommern',
  title: 'Social MV',
  description: 'Social-Media-Post im Stil Grüne Mecklenburg-Vorpommern',
  iconKey: 'PiWaves',
  avatar: '🌊',
  backgroundColor: '#316049',
  mention: 'social-mv',
  contextPrefix: '[LV: Mecklenburg-Vorpommern / Modus: Social Media]',
  skillCategory: 'social',
  promptTemplate: 'Erstelle Social-Media-Posts im Stil Grüne MV zum Thema: ',
} as const satisfies SystemSkill;
