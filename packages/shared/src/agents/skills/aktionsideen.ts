import type { SystemSkill } from './types.js';

export const AKTIONSIDEEN_SKILL = {
  identifier: 'gruenerator-oeffentlichkeitsarbeit',
  title: 'Aktionsideen',
  description: 'Kreative Aktionsideen entwickeln',
  iconKey: 'PiLightbulb',
  avatar: '💡',
  backgroundColor: '#316049',
  mention: 'aktion',
  contextPrefix: '[Plattform: Aktionsideen]',
  skillCategory: 'sonstiges',
  promptTemplate: 'Entwickle Aktionsideen zu: ',
} as const satisfies SystemSkill;
