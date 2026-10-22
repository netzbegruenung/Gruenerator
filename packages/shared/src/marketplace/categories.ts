import { type MarketplaceKind } from '@gruenerator/contracts';

import { type MarketplaceCollectionCover } from './frontpage.js';

interface MarketplaceCategoryDef {
  /** F0 — the `?kategorie=` value in shared links. */
  id: string;
  kicker: string;
  title: string;
  description: string;
  kinds: readonly MarketplaceKind[];
  /**
   * The front page tile, `/images/marketplace/kategorien/<file>-{640,1200}.webp`
   * (16:9). nginx serves `/images/**` immutable, so a new photo needs a new `-vN`.
   */
  cover: MarketplaceCollectionCover;
}

const utm = (url: string) => `${url}?utm_source=gruenerator&utm_medium=referral`;

/**
 * The four ways into the Marktplatz at the end of its front page, each opening
 * a page of its own. Client-side only: the server knows kinds, not categories.
 */
export const MARKETPLACE_CATEGORIES = [
  {
    id: 'grueneratoren',
    kicker: 'Agents & Rezepte',
    title: 'Grüneratoren',
    description: 'Für Pressemitteilung, Social Media, Anträge und Antworten an Bürger*innen.',
    kinds: ['agent', 'recipe'],
    cover: {
      file: 'grueneratoren-v1',
      alt: 'Ein goldener Füllfederhalter auf hellem Grund',
      credit: {
        author: 'Art Lasovsky',
        profileUrl: utm('https://unsplash.com/@artlasovsky'),
        photoUrl: utm('https://unsplash.com/photos/gold-fountain-pen-on-white-8XddFc6NkBY'),
      },
    },
  },
  {
    id: 'vorlagen',
    kicker: 'Zum Gestalten',
    title: 'Vorlagen',
    description: 'Sharepics, Plakate und Flyer, die andere öffentlich teilen.',
    kinds: ['template'],
    cover: {
      file: 'vorlagen-v1',
      alt: 'Zwei leere Blätter, mit Klammern an eine helle Wand gehängt',
      credit: {
        author: 'Angèle Kamp',
        profileUrl: utm('https://unsplash.com/@angelekamp'),
        photoUrl: utm(
          'https://unsplash.com/photos/two-blank-paper-with-clippings-attached-to-a-wall-HFXFY0_42es'
        ),
      },
    },
  },
  {
    id: 'sticker',
    kicker: 'Für eigene Designs',
    title: 'Sticker & Hintergründe',
    description: 'Freisteller und Flächen für Sharepics, Plakate und Canva.',
    kinds: ['sticker', 'background'],
    cover: {
      file: 'sticker-v1',
      alt: 'Geometrische Flächen aus Papier in Grün, Blau und Gelb',
      credit: {
        author: 'H&CO',
        profileUrl: utm('https://unsplash.com/@hngstrm'),
        photoUrl: utm(
          'https://unsplash.com/photos/a-close-up-view-of-a-multicolored-wall--lYTQduPhLo'
        ),
      },
    },
  },
  {
    id: 'notebooks',
    kicker: 'Wissen zum Fragen',
    title: 'Notebooks',
    description: 'Programme, Beschlüsse und Positionen, die du im Chat befragen kannst.',
    kinds: ['notebook'],
    cover: {
      file: 'notebooks-v1',
      alt: 'Ein Stapel Bücher auf einem weißen Tisch',
      credit: {
        author: 'Andrew Draper',
        profileUrl: utm('https://unsplash.com/@andalexander'),
        photoUrl: utm(
          'https://unsplash.com/photos/a-stack-of-books-sitting-on-top-of-a-white-table-08aIKKAQu0M'
        ),
      },
    },
  },
] as const satisfies readonly MarketplaceCategoryDef[];

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];
export type MarketplaceCategoryId = MarketplaceCategory['id'];

export function categoryById(id: string | null): MarketplaceCategory | null {
  return MARKETPLACE_CATEGORIES.find((c) => c.id === id) ?? null;
}
