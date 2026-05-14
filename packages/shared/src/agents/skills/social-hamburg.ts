import type { SystemSkill } from './types.js';

export const SOCIAL_HAMBURG_SKILL = {
  identifier: 'gruenerator-oeffentlichkeitsarbeit-hamburg',
  title: 'Social Hamburg',
  description: 'Social-Media-Post im Stil Grüne Hamburg',
  iconKey: 'PiAnchor',
  avatar: '⚓',
  backgroundColor: '#316049',
  mention: 'social-hamburg',
  skillCategory: 'social',
  promptTemplate: 'Erstelle Social-Media-Posts im Stil Grüne Hamburg zum Thema: ',
} as const satisfies SystemSkill;
