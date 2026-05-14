import type { SystemSkill } from './types.js';

export const KOMMUNALPOLITIK_SKILL = {
  identifier: 'gruenerator-antrag',
  title: 'Kommunalpolitik',
  description: 'Haushalt bewerten, beraten, Anträge & Resolutionen entwerfen',
  iconKey: 'PiBuildings',
  avatar: '🏛️',
  backgroundColor: '#316049',
  mention: 'kommunal',
  skillCategory: 'dokumente',
  isSystemDefault: true,
} as const satisfies SystemSkill;
