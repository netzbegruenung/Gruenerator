import { type MarketplaceCollection } from '../frontpage.js';

/**
 * „Queer und sichtbar“: the Grünerator-Vorlagen of the theme `queer` (party
 * content, loaded from the private catalogue at runtime) plus the official
 * Agents and Rezepte for the texts. Written up in docs/CLAUDE-collections.md.
 */
export const QUEER_COLLECTION = {
  id: 'queer',
  audience: 'all',
  kicker: 'Queer',
  title: 'Queer und sichtbar',
  description:
    'Sharepics, Texte und Agents für alle, die queere Menschen vor Ort sichtbar machen und schützen wollen: vom CSD bis zum Coming-out.',
  tone: 'klee',
  cover: {
    file: 'queer-v2',
    alt: 'Hände halten Regenbogenfahnen und Luftballons bei einer Pride-Parade',
    credit: {
      author: 'Tristan B',
      profileUrl: 'https://unsplash.com/@tristan-b?utm_source=gruenerator&utm_medium=referral',
      photoUrl:
        'https://unsplash.com/photos/72EYDDwn8dE?utm_source=gruenerator&utm_medium=referral',
    },
  },
  pinned: [
    { kind: 'agent', ref: 'gruenerator-oeffentlichkeitsarbeit' },
    { kind: 'recipe', ref: 'presse' },
    { kind: 'recipe', ref: 'instagram' },
    { kind: 'agent', ref: 'gruenerator-rede-schreiber' },
  ],
  fill: [],
  show: 14,
  min: 1,
  listed: false,
  story: [
    {
      type: 'text',
      paragraphs: [
        'Queere Menschen leben in jedem Ort, aber nicht überall können sie sich sicher zeigen. Wo ein CSD, ein Regenbogen am Rathaus oder ein klares Wort der Partei fehlt, bleibt das Gefühl, allein zu sein.',
        'Ein Ortsverband kann das ändern: sichtbar sein, bevor etwas passiert, und deutlich werden, wenn jemand angegriffen wird.',
      ],
    },
    {
      type: 'claim',
      text: '2.070 Straftaten gegen die sexuelle Orientierung.',
      note: 'Politisch motivierte Kriminalität in Deutschland 2025, dazu 1.294 Straftaten gegen geschlechtsbezogene Diversität (Bundesweite Fallzahlen, BKA/BMI).',
      source: {
        label: 'BMI/BKA: Bundesweite Fallzahlen 2025, Politisch motivierte Kriminalität',
        url: 'https://www.bmi.bund.de/SharedDocs/downloads/DE/publikationen/themen/sicherheit/BMI26013-factsheet2025.pdf',
      },
      audience: 'de-DE',
    },
    {
      type: 'claim',
      text: '330 Vorurteilsmotive gegen die sexuelle Orientierung.',
      note: 'Von der Polizei in Österreich 2025 dokumentiert, 2024 waren es 317 (Lagebericht Hate Crime, BMI).',
      source: {
        label: 'BMI Österreich: Lagebericht Hate Crime 2025',
        url: 'https://www.bmi.gv.at/408/projekt/files/244_2026_hate-crime-bericht-2025_v20260727_webbf.pdf',
      },
      audience: 'de-AT',
    },
    { type: 'vorlagen', thema: 'queer', heading: 'Sharepics für euren Kanal' },
    {
      type: 'quote',
      text: 'Wir haben vor dem CSD bei der Stadt nachgefragt, wer uns schützt. Seitdem steht der Ortsverband jedes Jahr mit einem Stand und einer klaren Aussage da.',
      by: 'Orga-Team eines CSD in Sachsen, Beispiel',
    },
    {
      type: 'text',
      paragraphs: [
        'Öffnet ein Sharepic, tauscht Foto und Ortsnamen aus und setzt euren Termin ein. Einen Kurztext für Instagram, die Pressemitteilung zum CSD oder die Rede am 17. Mai schreibt ihr mit den Agents und Rezepten darunter.',
        'Nennt dabei immer, wen ihr meint, und lasst Betroffene selbst zu Wort kommen.',
      ],
    },
    {
      type: 'items',
      display: 'rows',
      items: [
        { kind: 'agent', ref: 'gruenerator-oeffentlichkeitsarbeit' },
        { kind: 'recipe', ref: 'presse' },
        { kind: 'recipe', ref: 'instagram' },
      ],
    },
    {
      type: 'example',
      item: { kind: 'recipe', ref: 'instagram' },
      prompt:
        'Schreib einen Instagram-Post zu unserem CSD am 14. Juni: Infostand am Marktplatz, alle sind willkommen.',
      answer:
        'Am 14. Juni ist CSD bei uns im Ort. Kommt zum Infostand am Marktplatz: Hier sind alle willkommen, heute und an jedem anderen Tag. #CSD #Vielfalt',
    },
  ],
} as const satisfies MarketplaceCollection;
