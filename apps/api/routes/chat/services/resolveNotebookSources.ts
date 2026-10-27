/**
 * Authorization of the notebook documents a thread carries
 * (`notebookSourceRefs`, see threadNotebookSources.ts). Runs for EVERY ref on
 * EVERY turn — a stored ref grants nothing by itself — with exactly the rules
 * of the document reader the ref came from:
 *
 * - user document → `resolveReaderSource` (own, or a collaborator's read
 *   through a notebook the viewer can read);
 * - system document → the reader's collection rule (`isReaderCollectionId`,
 *   deliberately not `collectionsForLocale`: what the reader shows, the chat
 *   may read) plus the URL's membership UNDER the collection's default filter
 *   (`lookupSystemSource`) — all Landesverbände share one Qdrant collection.
 *
 * A ref without access resolves to `null`; an infrastructure failure throws,
 * so the caller can tell "gone" from "could not check".
 */
import { type NotebookSourceRef } from '@gruenerator/contracts';

import {
  getSystemCollectionConfig,
  isReaderCollectionId,
} from '../../../config/systemCollectionsConfig.js';
import { NotebookQdrantHelper } from '../../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import {
  resolveReaderSource,
  type NotebookSourcesDeps,
} from '../../../services/notebook/notebookSources.js';
import {
  lookupSystemSource,
  type SystemNotebookSourcesDeps,
} from '../../../services/notebook/systemNotebookSources.js';
import { checkNotebookAccess } from '../../notebook/notebookAccess.js';
import { qdrantScrollPage } from '../agents/notebookSourceTools.js';

import type { ResolvedNotebookSource } from '../../../agents/langgraph/ChatGraph/types.js';

export type ResolveNotebookSourcesDeps = Pick<NotebookSourcesDeps, 'db' | 'helper' | 'access'> &
  Pick<SystemNotebookSourcesDeps, 'scrollPage'>;

export interface NotebookSourceCheck {
  ref: NotebookSourceRef;
  /** `null`: no access (missing, foreign, trashed, outside the collection). */
  source: ResolvedNotebookSource | null;
}

let helperSingleton: NotebookQdrantHelper | null = null;

function resolveDeps(partial: Partial<ResolveNotebookSourcesDeps> | undefined) {
  return {
    db: partial?.db ?? getPostgresInstance(),
    helper: partial?.helper ?? (helperSingleton ??= new NotebookQdrantHelper()),
    access: partial?.access ?? checkNotebookAccess,
    scrollPage: partial?.scrollPage ?? qdrantScrollPage,
  };
}

async function resolveOne(
  ref: NotebookSourceRef,
  userId: string,
  deps: ResolveNotebookSourcesDeps
): Promise<ResolvedNotebookSource | null> {
  if ('documentId' in ref) {
    const source = await resolveReaderSource(
      { documentId: ref.documentId, notebookId: ref.notebookId, userId },
      deps
    );
    if (!source) return null;
    return {
      kind: 'user',
      documentId: ref.documentId,
      notebookId: ref.notebookId,
      ownerUserId: source.ownerUserId,
      title: source.title,
    };
  }
  const config = getSystemCollectionConfig(ref.collectionId);
  if (!config || !isReaderCollectionId(ref.collectionId)) return null;
  const collection = {
    key: config.key,
    systemId: config.id,
    name: config.name,
    qdrantCollection: config.qdrantCollection,
  };
  const found = await lookupSystemSource({ collection, sourceUrl: ref.sourceUrl }, deps);
  if ('error' in found) return null;
  return { kind: 'system', collection, sourceUrl: ref.sourceUrl, title: found.title };
}

/** One check per ref, in input order. Throws when any check could not run. */
export async function resolveNotebookSources(
  refs: readonly NotebookSourceRef[],
  userId: string,
  partial?: Partial<ResolveNotebookSourcesDeps>
): Promise<NotebookSourceCheck[]> {
  if (refs.length === 0) return [];
  const deps = resolveDeps(partial);
  return Promise.all(
    refs.map(async (ref) => ({ ref, source: await resolveOne(ref, userId, deps) }))
  );
}
