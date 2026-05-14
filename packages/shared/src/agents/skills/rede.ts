import type { SystemSkill } from './types.js';

export const REDE_SKILL = {
  identifier: 'gruenerator-rede-schreiber',
  title: 'Rede',
  description: 'Politische Reden',
  iconKey: 'PiMicrophoneStage',
  avatar: '🎙️',
  backgroundColor: '#316049',
  mention: 'rede',
  skillCategory: 'presse',
  promptTemplate: 'Schreibe eine Rede zum Thema: ',
} as const satisfies SystemSkill;
