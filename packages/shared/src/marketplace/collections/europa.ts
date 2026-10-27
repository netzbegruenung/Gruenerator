import { type MarketplaceCollection } from '../frontpage.js';

/**
 * „Europa verbindet“: the Grünerator-Vorlagen of the theme `europa` (party
 * content, loaded from the private catalogue at runtime), nothing else.
 * Written up in docs/CLAUDE-collections.md.
 */
export const EUROPA_COLLECTION = {
  id: 'europa',
  audience: 'all',
  kicker: 'Europa',
  title: 'Europa verbindet',
  description:
    'Europa ist das Versprechen, dass aus Feinden Nachbarn werden können. Aus den Trümmern des Zweiten Weltkriegs wuchs mit der **Schuman-Erklärung vom 9. Mai 1950** die Idee, Frieden durch Zusammenarbeit zu sichern; daran erinnert jedes Jahr der **Europatag**. Offene Grenzen im **Schengen-Raum**, gemeinsamer **Klimaschutz** und ein direkt gewähltes Parlament zeigen, was gemeinsam möglich ist. Doch **Demokratie, Rechtsstaatlichkeit und Zusammenhalt** sind keine Selbstverständlichkeit: Sie müssen gegen Nationalismus und Abschottung immer wieder neu verteidigt werden.',
  tone: 'tanne',
  cover: {
    file: 'europa-v1',
    alt: 'Ein großer Demonstrationszug mit vielen Europafahnen und Protestschildern zwischen Stadthäusern',
    credit: {
      author: 'Matt Brown',
      profileUrl: 'https://unsplash.com/@mattthebrown?utm_source=gruenerator&utm_medium=referral',
      photoUrl:
        'https://unsplash.com/photos/ZrrBdq0VNio?utm_source=gruenerator&utm_medium=referral',
    },
  },
  pinned: [],
  fill: [],
  show: 14,
  min: 0,
  row: 'themen',
  story: [{ type: 'vorlagen', thema: 'europa', heading: 'Sharepics für Europa' }],
} as const satisfies MarketplaceCollection;
