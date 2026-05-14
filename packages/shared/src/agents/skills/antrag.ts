import type { SystemSkill } from './types.js';

export const ANTRAG_SKILL = {
  identifier: 'gruenerator-antrag',
  title: 'Antrag',
  description: 'Anträge & Anfragen',
  iconKey: 'PiFileText',
  avatar: '📝',
  backgroundColor: '#316049',
  mention: 'antrag',
  skillCategory: 'dokumente',
  isSystemDefault: true,
  promptTemplate: 'Schreibe einen Antrag zum Thema: ',
} as const satisfies SystemSkill;
