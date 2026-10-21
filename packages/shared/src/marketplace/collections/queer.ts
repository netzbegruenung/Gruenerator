import { type MarketplaceCollection } from '../frontpage.js';

/**
 * „Queer und sichtbar“: the Grünerator-Vorlagen of the theme `queer` (party
 * content, loaded from the private catalogue at runtime), nothing else.
 * Written up in docs/CLAUDE-collections.md.
 */
export const QUEER_COLLECTION = {
  id: 'queer',
  audience: 'all',
  kicker: 'Queer',
  title: 'Queer und sichtbar',
  description:
    'Die Geschichte der queeren Bewegung ist eine Geschichte von **Mut, Widerstand** und dem unermüdlichen Kampf um das Recht, selbstbestimmt zu leben und zu lieben. Ihre Wurzeln reichen weit zurück, doch insbesondere die Proteste rund um das **Stonewall Inn** in New York im Jahr **1969** wurden zu einem Wendepunkt im Kampf gegen Diskriminierung und gesellschaftliche Ausgrenzung. Was einst als Aufbegehren gegen Unterdrückung begann, entwickelte sich zu einer weltweiten Bewegung für **Freiheit, Vielfalt und gleiche Rechte**.',
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
  pinned: [],
  fill: [],
  show: 14,
  min: 0,
  row: 'themen',
  story: [
    { type: 'vorlagen', thema: 'queer', heading: 'Sharepics für euren Kanal' },
    // Juna and Bunti, the Pride-Edition Friends with the rainbow.
    { type: 'friends', ids: [12, 13], heading: 'Regenbogen fürs Profilbild' },
  ],
} as const satisfies MarketplaceCollection;
