import { type MarketplaceCollection } from '../frontpage.js';

/**
 * „Frauen / Gleichstellung“: the Grünerator-Vorlagen of the theme `frauen`
 * (party content, loaded from the private catalogue at runtime), nothing else.
 * Written up in docs/CLAUDE-collections.md.
 */
export const GLEICHSTELLUNG_COLLECTION = {
  id: 'gleichstellung',
  audience: 'all',
  kicker: 'Frauen und Gleichstellung',
  title: 'Gleichstellung sichtbar machen',
  description:
    'Sharepics zu Lohn, Parität, Selbstbestimmung und dem 8. März. Foto und Ort tauschen, fertig.',
  tone: 'sand',
  cover: {
    file: 'gleichstellung-v2',
    alt: 'Eine Person mit Megafon und Kopftuch vor einer Menge mit erhobenen Fäusten',
    credit: {
      author: 'Colin Lloyd',
      profileUrl: 'https://unsplash.com/@colin-lloyd?utm_source=gruenerator&utm_medium=referral',
      photoUrl:
        'https://unsplash.com/photos/gcfvs__17dw?utm_source=gruenerator&utm_medium=referral',
    },
  },
  pinned: [],
  fill: [],
  show: 14,
  min: 0,
  listed: false,
  story: [
    {
      type: 'text',
      paragraphs: [
        'Gleichberechtigung ist keine Selbstverständlichkeit, sondern das Ergebnis jahrzehntelanger Auseinandersetzungen um Rechte, Freiheit und gesellschaftliche Teilhabe. Frauen haben sich das Wahlrecht erkämpft, traditionelle Rollenbilder infrage gestellt und neue Wege zur Selbstbestimmung eröffnet – doch bis heute prägen ungleiche Bezahlung, unbezahlte Sorgearbeit und geschlechtsspezifische Gewalt den Alltag vieler Frauen. Die Frauenbewegung steht deshalb nicht nur für die Errungenschaften vergangener Generationen, sondern auch für den fortdauernden Anspruch auf eine Gesellschaft, in der alle Menschen unabhängig von ihrem Geschlecht frei, sicher und selbstbestimmt leben können.',
      ],
    },
    { type: 'vorlagen', thema: 'frauen', heading: 'Sharepics zum Anpassen' },
  ],
} as const satisfies MarketplaceCollection;
