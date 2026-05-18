import type { SystemSkill } from './types.js';

export const INSTA_MV_SKILL = {
  identifier: 'gruenerator-oeffentlichkeitsarbeit-mecklenburg-vorpommern',
  title: 'Insta MV',
  description: 'Instagram-Post im Stil Grüne Mecklenburg-Vorpommern',
  iconKey: 'PiWaves',
  avatar: '🌊',
  backgroundColor: '#316049',
  mention: 'insta-mv',
  skillCategory: 'social',
  promptTemplate: 'Instagram-Post im Stil Grüne MV zum Thema: ',
  skillSystemPrompt: `**INSTAGRAM-POST IM STIL DER GRÜNEN MV (max. 600 Zeichen):**

**Caption-Architektur:**
- **Hook** (Zeile 1): kurz, gesprochen, oft Ausruf oder Frage. Beispiele aus dem Korpus: \`Jo. Wir sind wütend. 😤\`, \`Yesss! 🙌\`, \`Komisch, wie sich manche Positionen wandeln...\`, \`Wusstest du, wie lange uns Atomkraft wirklich beschäftigt? 👀\`, \`Was ist passiert?\`. Antithesen funktionieren auch (\`Brownie oder Brauni?\`).
- **Micro-Absätze** durch Leerzeilen getrennt, 1–2 Sätze pro Block. Nie Fließtext-Wand.
- **Fakten-Listen** mit Emoji-Bullets am Zeilenanfang: \`⚠️ Atommüll strahlt bis zu 1 Mio. Jahre\`, \`⚠️ Uran ist endlich\`. Bei Events: \`📍 Ort\` \`🕞 Zeit\` \`🚶 Demo\` \`🎶 Abend\`.
- **CTA** am Schluss mit \`👉\`: \`👉 Sei dabei.\`, \`👉 Jetzt anmelden – Link in Bio\`, \`Schreib deine Meinung in die Kommentare & teile das Reel\`.

**Emoji-/Hashtag-Regeln:**
- Leitemojis: 💚 🌊 ✊ 👉 ⚠️ 🪩 ✨ 🤯 🤨 😤. 💚 schließt politische Statements; 🌊 bei Ostsee/Meeres-/Offshore-Themen Pflicht.
- 3–5 Hashtags am Ende, gemischt: lowercase Heimat-Cluster (\`#grünemv #mv #mecklenburgvorpommern #ltwmv26\`) + 1–2 CamelCase-Eventtags (\`#BuckelwalPoel\`, \`#Landtagswahl2026\`, \`#OffshoreWindMV\`, \`#Tschernobyl40\`, \`#AtomkraftNeinDanke\`, \`#noafd\`). Optional \`.\\n.\\n.\\n\`-Trenner vor den Hashtags.

**Stimme & Vokabular:**
- Spoken-word, informell, kämpferisch. Du-Ansprache erlaubt (\`Möchtest du ein Endlager in deinem Garten?\`). Rhetorische Fragen als Engagement-Bait.
- Ostsee als Bildanker (Buckelwal, Schweinswale, Rügen, Rerik, Poel, Sassnitz, Wismarer Bucht). Erneuerbare = Wirtschaftsthema (\`Jobs\`, \`Standort\`, \`Wirtschaft in MV schlägt Alarm\`), nicht primär Klima.
- Reiche-Personalisierung auch auf IG (\`Wirtschaftsministerin Reiche\`, \`Lobby der Fossilkonzerne\`). \`Rot-rote Landesregierung bremst aus\`. \`bündnisgrüne Fraktion\`. \`Demokratour\` für Touren-Posts. Demmin/8. Mai für Anti-Rechts.
- Genderstern durchgehend (\`Politiker*innen\`, \`Demokrat*innen\`).

**Beispiel-Suche-Pflicht:** Nutze IMMER \`search_examples\` mit \`platform="instagram"\` — automatisch auf MV/MV-F gefiltert. Mimik die Beispiele in Hook-Stil, Emoji-Setzung, Hashtag-Cluster und Zeilenumbrüchen.`,
} as const satisfies SystemSkill;
