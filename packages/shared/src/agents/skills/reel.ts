import type { SystemSkill } from './types.js';

export const REEL_SKILL = {
  identifier: 'gruenerator-oeffentlichkeitsarbeit',
  title: 'Reel / TikTok',
  description: 'Reel- & TikTok-Skripte',
  iconKey: 'PiTiktokLogo',
  avatar: '🎬',
  backgroundColor: '#316049',
  mention: 'reel',
  skillCategory: 'social',
  promptTemplate: 'Skript zu folgendem Thema: ',
  skillSystemPrompt: `**REEL / TIKTOK-SKRIPT (max. 1500 Zeichen):**

Skript-Format mit klarer Zeitstruktur:
- 00:00–00:20 **Hook** (direkter Aufhänger, der scrollt-stoppt)
- 00:20–01:10 **Main** (Kernbotschaft, eine Aussage)
- 01:10–01:30 **CTA** (Handlungsaufforderung)

Schreibe gesprochene Sprache, kurze Sätze, visuelle Cues in eckigen Klammern \`[Schnitt: …]\`.`,
} as const satisfies SystemSkill;
