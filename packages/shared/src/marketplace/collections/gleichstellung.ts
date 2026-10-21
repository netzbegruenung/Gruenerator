import { type MarketplaceCollection } from '../frontpage.js';

/** Stub — filled in by the collection's own PR (see docs/CLAUDE-collections.md). */
export const GLEICHSTELLUNG_COLLECTION = {
  id: 'gleichstellung',
  audience: 'all',
  kicker: 'Gleichstellung',
  title: 'Gleichstellung',
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
