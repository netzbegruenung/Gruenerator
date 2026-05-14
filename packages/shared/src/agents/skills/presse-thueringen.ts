import type { SystemSkill } from './types.js';

export const PRESSE_THUERINGEN_SKILL = {
  identifier: 'gruenerator-oeffentlichkeitsarbeit-thueringen',
  title: 'PM Thüringen',
  description: 'Pressemitteilung im Stil Bündnisgrüne Thüringen',
  iconKey: 'PiTree',
  avatar: '🌲',
  backgroundColor: '#316049',
  mention: 'presse-thueringen',
  skillCategory: 'presse',
  promptTemplate: 'Schreibe eine Pressemitteilung im Stil Bündnisgrüne Thüringen zum Thema: ',
} as const satisfies SystemSkill;
