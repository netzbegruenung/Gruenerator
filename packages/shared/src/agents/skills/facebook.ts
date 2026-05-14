import type { SystemSkill } from './types.js';

export const FACEBOOK_SKILL = {
  identifier: 'gruenerator-oeffentlichkeitsarbeit',
  title: 'Facebook',
  description: 'Facebook-Posts & Beiträge',
  iconKey: 'PiFacebookLogo',
  avatar: '👍',
  backgroundColor: '#316049',
  mention: 'facebook',
  skillCategory: 'social',
  promptTemplate: 'Beitrag zu folgendem Thema: ',
  skillSystemPrompt: `**FACEBOOK-POST (max. 600 Zeichen):**

Locker, gesprächig, Emojis sparsam, Community-fokussiert, klarer Call-to-Action am Ende.

**Beispiel-Suche:** Nutze IMMER \`search_examples\` mit \`platform="facebook"\`, um echte, erfolgreiche Beispiel-Posts zu finden. Orientiere dich an Ton, Aufbau und Formatierung.`,
} as const satisfies SystemSkill;
