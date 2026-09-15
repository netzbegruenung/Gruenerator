/**
 * What of the person's memory reaches THIS turn's prompt.
 *
 * Instructions: all of them, always — a standing rule that is only sometimes
 * in the prompt is not a rule. Facts: all of them while there are few (a
 * semantic search over ten sentences buys nothing and costs an embedding
 * call); above `FACT_INLINE_LIMIT` the closest `FACT_SEARCH_LIMIT` to the
 * question. When the search fails or finds nothing above threshold, the most
 * recent facts go in instead of nothing: an outage must not make the assistant
 * forget, it may only make it less precise.
 */
import { createLogger } from '../../utils/logger.js';

import { memoryService, type MemoryService } from './memoryService.js';
import { qdrantMemoryVectors, type MemoryVectors } from './memoryStore.js';

import type { UserMemoryRow } from '../../database/schema/index.js';

const log = createLogger('MemoryRetrieval');

export const FACT_INLINE_LIMIT = 10;
export const FACT_SEARCH_LIMIT = 8;

export interface TurnMemories {
  anweisungen: UserMemoryRow[];
  fakten: UserMemoryRow[];
}

export async function loadTurnMemories(
  userId: string,
  queryText: string,
  deps: { list: MemoryService['list']; search: MemoryVectors['search'] } = {
    list: memoryService.list,
    search: qdrantMemoryVectors.search,
  }
): Promise<TurnMemories> {
  const rows = await deps.list(userId);
  const anweisungen = rows.filter((r) => r.kind === 'anweisung');
  const allFacts = rows.filter((r) => r.kind === 'fakt');
  if (allFacts.length <= FACT_INLINE_LIMIT) return { anweisungen, fakten: allFacts };

  const byId = new Map(allFacts.map((r) => [r.id, r]));
  const recent = () => allFacts.slice(-FACT_SEARCH_LIMIT);
  if (!queryText.trim()) return { anweisungen, fakten: recent() };

  try {
    const ids = await deps.search(userId, queryText, FACT_SEARCH_LIMIT);
    const hits = ids.map((id) => byId.get(id)).filter((r): r is UserMemoryRow => r != null);
    return { anweisungen, fakten: hits.length > 0 ? hits : recent() };
  } catch (err) {
    log.warn(`[Memory] fact search failed, falling back to recent facts: ${err}`);
    return { anweisungen, fakten: recent() };
  }
}
