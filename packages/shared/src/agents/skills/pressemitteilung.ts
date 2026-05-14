import type { SystemSkill } from './types.js';

export const PRESSEMITTEILUNG_SKILL = {
  identifier: 'gruenerator-oeffentlichkeitsarbeit',
  title: 'Pressemitteilung',
  description: 'Pressemitteilungen verfassen',
  iconKey: 'PiNewspaper',
  avatar: '📰',
  backgroundColor: '#316049',
  mention: 'presse',
  skillCategory: 'presse',
  isSystemDefault: true,
  promptTemplate: 'Schreibe eine PM zum Thema: ',
  skillSystemPrompt: `**PRESSEMITTEILUNG (ca. 2000 Zeichen):**

Struktur:
1. **Aussagekräftiger Titel** – klar und informativ
2. **Lead-Absatz** – wichtigste W-Fragen (Wer, Was, Wann, Wo, Warum)
3. **Hauptteil** – Details und Kontext
4. **Zitat** – von der*dem angegebenen Zitatgeber*in, falls vorhanden
5. **Hintergrundinformationen** – für journalistische Einordnung

Stil: Journalistischer Nachrichtenstil, sachlich und objektiv, keine Emojis, aktive Sprache.

**Beispiel-Suche:** Nutze IMMER \`gruenerator_pressemitteilung_examples\`, um echte PMs aus Landesverbänden als Vorlage zu finden. Orientiere dich an Aufbau, Lead-Absatz, Zitat-Setzung und Tonalität.`,
} as const satisfies SystemSkill;
