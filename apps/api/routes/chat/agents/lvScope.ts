/**
 * Landesverband (LV) scope resolution for example searches.
 *
 * A press-example search must be scoped to one Landesverband, otherwise the
 * composer mimics PMs from the wrong LV (e.g. a Brandenburg agent producing a
 * Hessen press release). The LV signal can arrive two ways:
 *   1. on the agent itself — `toolRestrictions.examplesLvScope` (explicit) or
 *      `defaultFilter.landesverband` (per-LV PR agents), or
 *   2. via the active notebook/collection scope — the same `landesverband` that
 *      document search already derives from a collection's default filter.
 *
 * This is the single source of truth so every PM-example path (the ChatGraph
 * search node AND the AI-SDK `gruenerator_pressemitteilung_examples` tool used
 * by the board agent) applies the LV identically. The agent's own scope always
 * wins; the collection-derived scope is a fallback so a generic agent bound to
 * an LV notebook still grounds in the right LV.
 */

import { COLLECTION_MAP } from '../../../config/collectionMap.js';
import { getCollectionDefaultFilter } from '../../../config/systemCollectionsConfig.js';

import type { AgentConfig } from './types.js';

/**
 * Map chat-facing collection keys (e.g. `brandenburg`) to their `landesverband`
 * short-code(s) by reusing the system collection's `defaultFilter` — the exact
 * filter document search already applies. Non-LV collections (deutschland,
 * kommunalwiki, …) carry no `landesverband` default and contribute nothing, so
 * a federal notebook correctly yields no LV scope. Returns `undefined` when no
 * collection resolves to an LV.
 */
function deriveLvFromCollections(
  collectionIds: readonly string[] | undefined
): string[] | undefined {
  if (!collectionIds || collectionIds.length === 0) return undefined;
  const codes = new Set<string>();
  for (const collection of collectionIds) {
    const mapping = COLLECTION_MAP[collection];
    if (!mapping) continue;
    const defaultFilter = getCollectionDefaultFilter(mapping.systemId);
    if (!defaultFilter || defaultFilter.field !== 'landesverband') continue;
    if (Array.isArray(defaultFilter.value)) {
      for (const v of defaultFilter.value) codes.add(v);
    } else {
      codes.add(defaultFilter.value);
    }
  }
  return codes.size > 0 ? [...codes] : undefined;
}

/**
 * Resolve the Landesverband scope for an example search: the agent's explicit
 * scope first, then the LV implied by the active notebook/collection scope.
 * Returns `undefined` when no LV applies (federal/Austrian agents and notebooks).
 */
export function resolveExamplesLvScope(
  agentConfig: Pick<AgentConfig, 'toolRestrictions' | 'defaultFilter'>,
  scope?: {
    notebookCollectionIds?: readonly string[];
    defaultNotebookCollectionIds?: readonly string[];
  }
): string | readonly string[] | undefined {
  const fromAgent =
    agentConfig.toolRestrictions?.examplesLvScope ?? agentConfig.defaultFilter?.landesverband;
  if (fromAgent !== undefined) return fromAgent;

  // Prefer an explicitly @mentioned notebook scope over the agent's bound
  // default notebook, mirroring the document-search collection priority.
  const collections = scope?.notebookCollectionIds?.length
    ? scope.notebookCollectionIds
    : scope?.defaultNotebookCollectionIds;
  return deriveLvFromCollections(collections);
}
