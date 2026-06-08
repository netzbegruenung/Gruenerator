/**
 * Stage 1 source registry. One resolver per source type, keyed by the contract's
 * union literal — adding a source type is a single entry here and a compile error
 * until you provide it (the mapped type is exhaustive).
 */
import {
  type BoardFlowCardContext,
  type BoardFlowSource,
  type BoardFlowSourceType,
} from '@gruenerator/contracts';

import { apifySource } from './apifySource.js';
import { cardSource } from './cardSource.js';
import { scrapeSource } from './scrapeSource.js';

type SourceResolver<T extends BoardFlowSourceType> = (
  source: Extract<BoardFlowSource, { type: T }>,
  ctx: BoardFlowCardContext
) => Promise<string>;

const SOURCE_RESOLVERS: { [T in BoardFlowSourceType]: SourceResolver<T> } = {
  card: cardSource,
  scrape_url: scrapeSource,
  apify_social: apifySource,
};

/** Resolve a source node into extra context text for the AI step (may be empty). */
export function resolveSourceText(
  source: BoardFlowSource,
  ctx: BoardFlowCardContext
): Promise<string> {
  // Boundary cast: the registry lookup can't correlate source.type with the
  // matching narrowed resolver, so we widen to the union signature here.
  const resolver = SOURCE_RESOLVERS[source.type] as SourceResolver<BoardFlowSourceType>;
  return resolver(source, ctx);
}
