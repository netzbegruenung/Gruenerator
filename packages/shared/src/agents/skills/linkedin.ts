import type { SystemSkill } from './types.js';

export const LINKEDIN_SKILL = {
  identifier: 'gruenerator-oeffentlichkeitsarbeit',
  title: 'LinkedIn',
  description: 'LinkedIn-Posts & Artikel',
  iconKey: 'PiLinkedinLogo',
  avatar: '💼',
  backgroundColor: '#316049',
  mention: 'linkedin',
  contextPrefix: '[Plattform: LinkedIn]',
  skillCategory: 'social',
  promptTemplate: 'LinkedIn-Post zu: ',
  skillSystemPrompt: `**LINKEDIN-POST (max. 600 Zeichen):**

Professionell aber zugänglich, Analysen und Einblicke, minimale Emojis. Adressiere Multiplikator*innen und Fachpublikum.

**Beispiel-Suche:** Nutze IMMER \`search_examples\` mit \`platform="linkedin"\`, falls Beispiele vorhanden sind. Sonst orientiere dich an einem ruhigen, analytischen Ton.`,
} as const satisfies SystemSkill;
