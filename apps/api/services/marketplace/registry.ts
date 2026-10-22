import { type MarketplaceKind } from '@gruenerator/contracts';

import { agentSource } from './sources/agentSource.js';
import { notebookSource } from './sources/notebookSource.js';
import { recipeSource } from './sources/recipeSource.js';
import { studioAssetSource } from './sources/studioAssetSource.js';
import { templateSource } from './sources/templateSource.js';

import type { MarketplaceSource } from './sources/types.js';

/**
 * One adapter per kind; the compiler catches a kind nobody serves. Annotated
 * with the mapped type (rather than `satisfies`) so that indexing with a
 * generic `K` yields `MarketplaceSource<K>`.
 */
export const MARKETPLACE_SOURCES: { [K in MarketplaceKind]: MarketplaceSource<K> } = {
  agent: agentSource,
  recipe: recipeSource,
  template: templateSource,
  sticker: studioAssetSource('sticker'),
  background: studioAssetSource('background'),
  notebook: notebookSource,
};

export function sourceOf<K extends MarketplaceKind>(kind: K): MarketplaceSource<K> {
  return MARKETPLACE_SOURCES[kind];
}
