import type { SystemSkill } from './types.js';

export const TWITTER_SKILL = {
  identifier: 'gruenerator-oeffentlichkeitsarbeit',
  title: 'Twitter / X',
  description: 'Tweets & Threads',
  iconKey: 'PiXLogo',
  avatar: '🐦',
  backgroundColor: '#316049',
  mention: 'twitter',
  skillCategory: 'social',
  promptTemplate: 'Tweet zu folgendem Thema: ',
  skillSystemPrompt: `**TWEET / X-POST (max. 280 Zeichen):**

Prägnant, pointiert, direkte Sprache, sparsame Emojis. Eine zentrale Aussage statt mehrerer.

**Beispiel-Suche:** Nutze IMMER \`search_examples\` mit \`platform="bluesky"\` (NICHT "twitter"/"x") — unsere Tweet-Beispiele sind in der Beispiel-Datenbank als Bluesky-Posts hinterlegt (Cross-Posts der offiziellen Grünen-Accounts). Orientiere dich an Ton, Aufbau und Formatierung.`,
} as const satisfies SystemSkill;
