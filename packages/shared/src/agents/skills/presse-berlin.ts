import type { SystemSkill } from './types.js';

export const PRESSE_BERLIN_SKILL = {
  identifier: 'gruenerator-oeffentlichkeitsarbeit-berlin',
  title: 'PM Berlin',
  description: 'Pressemitteilung im Stil Grüne Berlin',
  iconKey: 'PiBuildings',
  avatar: '🐻',
  backgroundColor: '#316049',
  mention: 'presse-berlin',
  contextPrefix: '[LV: Berlin / Modus: PM]',
  skillCategory: 'presse',
  promptTemplate: 'Schreibe eine Pressemitteilung im Stil Grüne Berlin zum Thema: ',
} as const satisfies SystemSkill;
