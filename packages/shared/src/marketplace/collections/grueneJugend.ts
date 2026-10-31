import { type MarketplaceCollection } from '../frontpage.js';

/**
 * The Grünerator-Vorlagen in the design of each country's Grüne Jugend (party
 * content, loaded from the private catalogue at runtime), nothing else. One
 * collection per country: a viewer sees only their own country's Vorlagen.
 * Written up in docs/CLAUDE-collections.md.
 */
const COVER = {
  file: 'gruene-jugend-v1',
  alt: 'Ein weißer Lautsprechertrichter an einem Holzmast vor blauem Himmel',
  credit: {
    author: 'Mufid Majnun',
    profileUrl: 'https://unsplash.com/@mufidpwt?utm_source=gruenerator&utm_medium=referral',
    photoUrl: 'https://unsplash.com/photos/f6kLn8GplMQ?utm_source=gruenerator&utm_medium=referral',
  },
} as const;

export const GRUENE_JUGEND_COLLECTION = {
  id: 'gruene-jugend',
  audience: 'de-DE',
  kicker: 'GRÜNE JUGEND',
  title: 'Sharepics im Design der GRÜNEN JUGEND',
  description:
    'Die **GRÜNE JUGEND** ist der Jugendverband der Grünen, und ihre Sharepics sehen anders aus als die der Partei: **schwarze Zeilenbalken**, kräftige Farben, Handschrift auf Klebeband. Hier liegen die Vorlagen in diesem Design, von der Einladung mit Datum und Ort über Termine im Kalenderblatt bis zum Erklär-Karussell. Jede Vorlage öffnet sich im Design der GRÜNEN JUGEND.',
  tone: 'klee',
  cover: COVER,
  pinned: [],
  fill: [],
  show: 14,
  min: 0,
  story: [{ type: 'vorlagen', brand: 'gruene-jugend', heading: 'Vorlagen für eure Ortsgruppe' }],
} as const satisfies MarketplaceCollection;

export const GRUENE_JUGEND_AT_COLLECTION = {
  id: 'gruene-jugend-oesterreich',
  audience: 'de-AT',
  kicker: 'Grüne Jugend',
  title: 'Sharepics im Design der Grünen Jugend',
  description:
    'Die **Grüne Jugend Österreich** setzt auf ein kantiges, plakatives Design: **breite Versalien**, Waldgrün und Maigrün, weiße Karten mit hartem Schatten und ein gelber Störer. Hier findest du die Vorlagen dazu, vom Event-Plakat über Termine auf Etiketten bis zum Erklär-Karussell. Jede Vorlage öffnet sich im Design der Grünen Jugend.',
  tone: 'klee',
  cover: COVER,
  pinned: [],
  fill: [],
  show: 14,
  min: 0,
  story: [{ type: 'vorlagen', brand: 'gruene-jugend', heading: 'Vorlagen für eure Gruppe' }],
} as const satisfies MarketplaceCollection;
