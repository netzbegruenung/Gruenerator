import type { SystemSkill } from './types.js';

export const BUERGERSERVICE_SKILL = {
  identifier: 'gruenerator-buergerservice',
  title: 'Bürger*innenanfragen',
  description: 'Bürger*innenanfragen beantworten',
  iconKey: 'PiChatCircle',
  avatar: '💬',
  backgroundColor: '#316049',
  mention: 'bürgerservice',
  skillCategory: 'presse',
  promptTemplate: 'Beantworte folgende Anfrage: ',
} as const satisfies SystemSkill;
