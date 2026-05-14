import type { SystemSkill } from './types.js';

export const INSTAGRAM_SKILL = {
  identifier: 'gruenerator-oeffentlichkeitsarbeit',
  title: 'Instagram',
  description: 'Instagram-Posts & Captions',
  iconKey: 'PiInstagramLogo',
  avatar: '📸',
  backgroundColor: '#316049',
  mention: 'instagram',
  contextPrefix: '[Plattform: Instagram]',
  skillCategory: 'social',
  isSystemDefault: true,
  promptTemplate: 'Post zu folgendem Thema: ',
  skillSystemPrompt: `**INSTAGRAM-POST (max. 600 Zeichen):**

Visuell, Emojis am Satzanfang/-ende für Barrierefreiheit, strategische Hashtags. Erste Zeile als Hook.

**Beispiel-Suche:** Nutze IMMER \`search_examples\` mit \`platform="instagram"\`, um echte, erfolgreiche Beispiel-Posts zu finden. Orientiere dich an Ton, Aufbau und Formatierung.`,
} as const satisfies SystemSkill;
