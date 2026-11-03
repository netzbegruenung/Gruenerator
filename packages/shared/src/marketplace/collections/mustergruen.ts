import { type MarketplaceCollection } from '../frontpage.js';

/**
 * The showcase collection: what a Landesverband's campaign kit can look like.
 * Everything in it is fictional (Landesverband Mustergrün, candidate Maxi
 * Mustermensch, election day Sunday the 13th of September). Stickers, frames
 * and backgrounds are in the public catalogues under `kollektion:
 * 'mustergruen-wahlkampf'`; the Vorlagen (`mustergruen-maxi-*`) and the agent's
 * persona live in gruenerator-intern. The old id `wahlkampf-moritz` maps to this
 * entry (`filters.ts`).
 */
export const MUSTERGRUEN_COLLECTION = {
  id: 'mustergruen-wahlkampf',
  audience: 'de-DE',
  kicker: 'Musterkollektion · Wahlkampf',
  title: 'Maxi für Mustergrün',
  description:
    'So kann das Kampagnen-Paket eines Landesverbands aussehen: Profilbild-Rahmen, Sticker, Hintergründe, Sharepics, Stories und Visitenkarten für die Kandidatin Maxi Mustermensch, dazu ein Agent für ihre Texte. Alles ausgedacht, alles anpassbar.',
  tone: 'klee',
  cover: {
    file: 'mustergruen-v1',
    alt: 'Ein Infostand mit grüner Decke und Sonnenblumen auf einem Marktplatz zwischen Giebelhäusern',
    credit: null,
  },
  pinned: [
    { kind: 'agent', ref: 'mustergruen-maxi-mustermensch' },
    { kind: 'agent', ref: 'gruenerator-oeffentlichkeitsarbeit' },
    { kind: 'recipe', ref: 'presse' },
    { kind: 'recipe', ref: 'instagram' },
    { kind: 'agent', ref: 'gruenerator-rede-schreiber' },
  ],
  fill: [],
  show: 16,
  min: 1,
  story: [
    {
      type: 'text',
      paragraphs: [
        'Ein Wahlkampf besteht aus vielen kleinen Dingen, die zusammenpassen müssen: ein Gesicht, ein Datum, ein Ton. Dieses Paket zeigt, wie ein Landesverband sie an einem Ort bündelt, damit Kreis- und Ortsverbände nicht bei null anfangen.',
      ],
    },
    {
      type: 'claim',
      text: 'Am Wahlsonntag: Grün wählen.',
      note: 'Der ausgedachte Wahltag dieser Musterkollektion ist Sonntag, der 13. September.',
      source: null,
    },
    {
      type: 'profilbild',
      kollektion: 'mustergruen-wahlkampf',
      heading: 'Fürs Profilbild',
    },
    {
      type: 'text',
      paragraphs: [
        'Wer Maxi unterstützt, setzt zuerst den Rahmen aufs Profilbild: „Ich wähle Maxi“, „Team Mustergrün“ oder der Wahltag. Sticker und Hintergründe passen dazu. Mit dem Abo liegen auch die Sharepics, Stories und Visitenkarten in der Startrampe bereit.',
      ],
    },
    {
      type: 'items',
      display: 'rows',
      heading: 'Für die Texte',
      items: [
        { kind: 'agent', ref: 'mustergruen-maxi-mustermensch' },
        { kind: 'recipe', ref: 'presse' },
        { kind: 'recipe', ref: 'instagram' },
      ],
    },
  ],
  kit: {
    sharepicVorlagen: [
      'mustergruen-maxi-zitat-feed',
      'mustergruen-maxi-zitat-story',
      'mustergruen-maxi-wahltag-feed',
      'mustergruen-maxi-wahltag-story',
      'mustergruen-maxi-versprechen-feed',
      'mustergruen-maxi-versprechen-story',
      'mustergruen-maxi-gehwaehlen-feed',
      'mustergruen-maxi-gehwaehlen-story',
      'mustergruen-maxi-tour-feed',
      'mustergruen-maxi-tour-story',
      'mustergruen-maxi-tour-adresse-feed',
      'mustergruen-maxi-tour-adresse-story',
    ],
    printVorlagen: ['mustergruen-maxi-visitenkarte-tanne', 'mustergruen-maxi-visitenkarte-sand'],
  },
} as const satisfies MarketplaceCollection;
