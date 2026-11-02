import { type MarketplaceCollection } from '../frontpage.js';

/**
 * The Grünerator-Vorlagen in the design of each country's Grüne Jugend (party
 * content, loaded from the private catalogue at runtime), nothing else. One
 * collection per country: a viewer sees only their own country's Vorlagen.
 * Written up in docs/CLAUDE-collections.md.
 */
/** Junge Leute auf der Straße, wie im Kopf von gruene-jugend.de. */
const COVER = {
  file: 'gruene-jugend-v2',
  alt: 'Junge Menschen auf einer Klimademo in Bonn, vorne ein großes Banner „March for Climate“',
  credit: {
    author: 'Mika Baumeister',
    profileUrl: 'https://unsplash.com/@kommumikation?utm_source=gruenerator&utm_medium=referral',
    photoUrl: 'https://unsplash.com/photos/gpZZtJDDkSc?utm_source=gruenerator&utm_medium=referral',
  },
} as const;

const AT_COVER = {
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
    'Du lädst zur nächsten Demo ein, kündigst das Ortsgruppentreffen an oder willst erklären, warum Klimagerechtigkeit nicht warten kann? Hier findest du die Sharepics im Look der **GRÜNEN JUGEND**: **schwarze Zeilenbalken**, knallige Farben, Handschrift auf Klebeband. Vorlage aussuchen, deinen Text rein – und raus damit!',
  tone: 'klee',
  cover: COVER,
  pinned: [],
  fill: [],
  show: 14,
  min: 0,
  story: [
    { type: 'vorlagen', brand: 'gruene-jugend', heading: 'Vorlagen für eure Ortsgruppe' },
    { type: 'profilbild', kollektion: 'gruene-jugend', heading: 'Fürs Profilbild' },
  ],
} as const satisfies MarketplaceCollection;

export const GRUENE_JUGEND_AT_COLLECTION = {
  id: 'gruene-jugend-oesterreich',
  audience: 'de-AT',
  kicker: 'Grüne Jugend',
  title: 'Sharepics im Design der Grünen Jugend',
  description:
    'Die **Grüne Jugend Österreich** setzt auf ein kantiges, plakatives Design: **breite Versalien**, Waldgrün und Maigrün, weiße Karten mit hartem Schatten und ein gelber Störer. Hier findest du die Vorlagen dazu, vom Event-Plakat über Termine auf Etiketten bis zum Erklär-Karussell. Jede Vorlage öffnet sich im Design der Grünen Jugend.',
  tone: 'klee',
  cover: AT_COVER,
  pinned: [],
  fill: [],
  show: 14,
  min: 0,
  story: [
    { type: 'vorlagen', brand: 'gruene-jugend', heading: 'Vorlagen für eure Gruppe' },
    { type: 'profilbild', kollektion: 'gruene-jugend-oesterreich', heading: 'Fürs Profilbild' },
  ],
} as const satisfies MarketplaceCollection;
