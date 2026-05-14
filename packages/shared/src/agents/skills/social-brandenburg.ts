import type { SystemSkill } from './types.js';

export const SOCIAL_BRANDENBURG_SKILL = {
  identifier: 'gruenerator-oeffentlichkeitsarbeit-brandenburg',
  title: 'Social Brandenburg',
  description: 'Social-Media-Post im Stil Brandenburger Bündnisgrüne',
  iconKey: 'PiFlowerLight',
  avatar: '🌻',
  backgroundColor: '#316049',
  mention: 'social-brandenburg',
  contextPrefix: '[LV: Brandenburg / Modus: Social Media]',
  skillCategory: 'social',
  promptTemplate: 'Erstelle Social-Media-Posts im Stil Brandenburger Bündnisgrüne zum Thema: ',
} as const satisfies SystemSkill;
