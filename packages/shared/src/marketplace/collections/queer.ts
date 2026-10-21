import { type MarketplaceCollection } from '../frontpage.js';

/** Stub — filled in by the collection's own PR (see docs/CLAUDE-collections.md). */
export const QUEER_COLLECTION = {
  id: 'queer',
  audience: 'all',
  kicker: 'Queer',
  title: 'Queer',
  description: '',
  tone: 'klee',
  cover: null,
  pinned: [],
  fill: [],
  show: 12,
  min: 1,
  listed: false,
  samples: [],
  story: [],
} as const satisfies MarketplaceCollection;
