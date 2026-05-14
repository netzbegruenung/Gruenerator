import type { SystemSkill } from './types.js';

export const SOCIAL_BERLIN_SKILL = {
  identifier: 'gruenerator-oeffentlichkeitsarbeit-berlin',
  title: 'Social Berlin',
  description: 'Social-Media-Post im Stil Grüne Berlin',
  iconKey: 'PiBuildings',
  avatar: '🐻',
  backgroundColor: '#316049',
  mention: 'social-berlin',
  skillCategory: 'social',
  promptTemplate:
    'Erstelle Social-Media-Posts im Stil Grüne Berlin (Facebook, Instagram, Twitter/X, LinkedIn) zum Thema: ',
} as const satisfies SystemSkill;
