import type { SystemSkill } from './types.js';

export const LEICHTE_SPRACHE_SKILL = {
  identifier: 'gruenerator-leichte-sprache',
  title: 'Leichte Sprache',
  description: 'Texte in Leichte Sprache übersetzen',
  iconKey: 'PiTranslate',
  avatar: '🗣️',
  backgroundColor: '#316049',
  mention: 'leichte-sprache',
  skillCategory: 'sonstiges',
  promptTemplate: 'Übersetze folgenden Text in Leichte Sprache: ',
} as const satisfies SystemSkill;
