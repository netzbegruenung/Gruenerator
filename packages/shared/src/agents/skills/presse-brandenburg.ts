import type { SystemSkill } from './types.js';

export const PRESSE_BRANDENBURG_SKILL = {
  identifier: 'gruenerator-oeffentlichkeitsarbeit-brandenburg',
  title: 'PM Brandenburg',
  description: 'Pressemitteilung im Stil Brandenburger Bündnisgrüne',
  iconKey: 'PiFlowerLight',
  avatar: '🌻',
  backgroundColor: '#316049',
  mention: 'presse-brandenburg',
  skillCategory: 'presse',
  promptTemplate: 'Schreibe eine Pressemitteilung im Stil Brandenburger Bündnisgrüne zum Thema: ',
} as const satisfies SystemSkill;
