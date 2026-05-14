import type { SystemSkill } from './types.js';

export const PRESSE_MV_SKILL = {
  identifier: 'gruenerator-oeffentlichkeitsarbeit-mecklenburg-vorpommern',
  title: 'PM MV',
  description: 'Pressemitteilung im Stil Grüne Mecklenburg-Vorpommern',
  iconKey: 'PiWaves',
  avatar: '🌊',
  backgroundColor: '#316049',
  mention: 'presse-mv',
  skillCategory: 'presse',
  promptTemplate: 'Schreibe eine Pressemitteilung im Stil Grüne MV zum Thema: ',
} as const satisfies SystemSkill;
