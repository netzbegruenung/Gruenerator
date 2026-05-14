import type { SystemSkill } from './types.js';

export const SOCIAL_THUERINGEN_SKILL = {
  identifier: 'gruenerator-oeffentlichkeitsarbeit-thueringen',
  title: 'Social Thüringen',
  description: 'Social-Media-Post im Stil Bündnisgrüne Thüringen',
  iconKey: 'PiTree',
  avatar: '🌲',
  backgroundColor: '#316049',
  mention: 'social-thueringen',
  skillCategory: 'social',
  promptTemplate: 'Erstelle Social-Media-Posts im Stil Bündnisgrüne Thüringen zum Thema: ',
} as const satisfies SystemSkill;
