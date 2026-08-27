/**
 * Which Grünerator notebooks a run may look into.
 *
 * Deliberately narrow: the party corpora, which are public system collections,
 * plus the personal notebooks this turn already had in hand. The agent gets no
 * way to discover or reach a notebook nobody selected — so no new authorization
 * path is created here. The ownership check for personal notebooks happened far
 * upstream, in `streamContext.ts` via `resolveUserNotebookDocumentIds`, and what
 * arrives here is already nothing but a list of document ids the user may read.
 *
 * Three id namespaces meet in this file and must not be confused:
 *   notebook id (`berlin-notebook`) — registry, mentions, what the model picks
 *   collection key (`berlin`)       — what `executeDirectSearch` takes
 *   system collection id (`berlin-system`) — `NotebookQAService`, unused here
 */

import { getNotebooksForAudience } from '@gruenerator/shared/notebooks';

import {
  NOTEBOOK_GATE,
  resolveNotebookCollections,
} from '../../../config/notebookCollectionMap.js';

import { type ResearchLocale } from './types.js';

/** One corpus the model may name in `notebook_suche`. */
export interface NotebookCorpus {
  /** Notebook id — the value that appears in the tool schema's enum. */
  id: string;
  title: string;
  description: string;
  /** Collection keys this notebook resolves to. */
  collections: string[];
}

export interface NotebookScope {
  corpora: NotebookCorpus[];
  /**
   * Collections from explicit `@notebook` mentions. Kept unfiltered on purpose,
   * mirroring searchNode: an explicit mention outranks the instance's curation.
   */
  mentionedCollections: string[];
  /** Documents inside personal notebooks — ownership already verified upstream. */
  documentIds: string[];
  userId: string;
}

/** The subset of `ChatGraphState` this needs. Stated so tests need no full state. */
export interface NotebookScopeInput {
  notebookCollectionIds?: string[];
  notebookDocumentIds?: string[];
  defaultNotebookCollectionIds?: string[];
  defaultNotebookDocumentIds?: string[];
}

function unique(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === 'string' && v.length > 0))];
}

/**
 * Returns `null` when there is nothing to search — the tool is then not
 * registered at all, which is better than offering the model a door that opens
 * onto an empty room.
 */
export function buildNotebookScope(
  state: NotebookScopeInput,
  locale: ResearchLocale,
  userId: string
): NotebookScope | null {
  const corpora: NotebookCorpus[] = [];
  for (const nb of getNotebooksForAudience(locale)) {
    // `getNotebooksForAudience` filters by locale against the DEFAULT instance;
    // the gate is what binds THIS process's instance policy and the collection
    // mapping. A notebook without collections cannot be searched at all.
    if (!NOTEBOOK_GATE.isImplicitlySearchable(nb.id)) continue;
    const collections = resolveNotebookCollections([nb.id]);
    if (collections.length === 0) continue;
    corpora.push({
      id: nb.id,
      title: nb.title,
      description: nb.description,
      collections,
    });
  }

  const mentionedCollections = unique([
    ...(state.notebookCollectionIds ?? []),
    ...(state.defaultNotebookCollectionIds ?? []),
  ]);
  const documentIds = unique([
    ...(state.notebookDocumentIds ?? []),
    ...(state.defaultNotebookDocumentIds ?? []),
  ]);

  if (corpora.length === 0 && mentionedCollections.length === 0 && documentIds.length === 0) {
    return null;
  }

  return { corpora, mentionedCollections, documentIds, userId };
}
