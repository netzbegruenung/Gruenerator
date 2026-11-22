/**
 * Pro Wissens-Eintrag: liegt er im Suchbereich des Projekts? Reine Ableitung aus
 * dem, was die Listen-Abfrage ohnehin liest; die Deckel spiegeln
 * `getProjectFileDocumentIds` (neueste 200 nach `shared_at`) und
 * `getProjectCollabDocumentIds` (neueste 50 mit Indexzeile und Chunks).
 */
import { type ProjectSearchState } from '@gruenerator/contracts';

import { PROJECT_COLLAB_SEARCH_CAP, PROJECT_COLLAB_SUBTYPES } from './projectCollabDocs.js';
import { PROJECT_FILE_DOCUMENT_CAP } from './projectFiles.js';

export interface DocumentSearchInput {
  id: string;
  status: string | null;
  vector_count: number | null;
  user_id: string | null;
  shared_at: string | Date | null;
}

export interface CollabSearchInput {
  id: string;
  document_subtype: string | null;
  updated_at: string | Date | null;
  /** `collab_search_index` per LEFT JOIN: null = keine Indexzeile. */
  index_checked_at: string | Date | null;
  index_chunk_count: number | null;
  shared_at: string | Date | null;
}

const time = (v: string | Date | null | undefined): number => (v ? new Date(v).getTime() || 0 : 0);

export function deriveDocumentSearchState(
  d: DocumentSearchInput,
  inCappedScope: boolean
): ProjectSearchState {
  switch (d.status) {
    case 'failed':
      return 'failed';
    case 'completed':
      if ((d.vector_count ?? 0) <= 0) return 'not_searchable';
      return inCappedScope ? 'ready' : 'over_cap';
    default:
      return 'indexing';
  }
}

/**
 * Ohne Indexzeile so lange „wird bald durchsuchbar". Der Index-Worker greift
 * nach 2 Minuten Ruhe und schafft 10 Docs je Minute (`collabSearchIndex.ts`);
 * ein Doc ohne Text bekommt nie eine Zeile (sie wird dann gelöscht) und hiesse
 * sonst für immer „bald".
 */
export const COLLAB_INDEX_GRACE_MS = 15 * 60_000;

export function deriveCollabSearchState(
  c: CollabSearchInput,
  inCappedScope: boolean,
  now: number = Date.now()
): ProjectSearchState | null {
  if (!(PROJECT_COLLAB_SUBTYPES as readonly string[]).includes(c.document_subtype ?? '')) {
    return null;
  }
  if (c.index_checked_at == null) {
    return now - time(c.updated_at) > COLLAB_INDEX_GRACE_MS ? 'not_searchable' : 'pending';
  }
  if (time(c.index_checked_at) < time(c.updated_at)) return 'stale';
  if ((c.index_chunk_count ?? 0) <= 0) return 'not_searchable';
  return inCappedScope ? 'ready' : 'over_cap';
}

function newestIds<T extends { id: string; shared_at: string | Date | null }>(
  rows: T[],
  cap: number
): Set<string> {
  return new Set(
    [...rows]
      .sort((a, b) => time(b.shared_at) - time(a.shared_at))
      .slice(0, cap)
      .map((r) => r.id)
  );
}

/** Zustand je Dokument-ID; nur Zeilen im Suchbereich (completed, Besitzer) zählen für den Deckel. */
export function documentSearchStates(rows: DocumentSearchInput[]): Map<string, ProjectSearchState> {
  const scope = newestIds(
    rows.filter((r) => r.status === 'completed' && r.user_id != null),
    PROJECT_FILE_DOCUMENT_CAP
  );
  return new Map(rows.map((r) => [r.id, deriveDocumentSearchState(r, scope.has(r.id))]));
}

export function collabSearchStates(
  rows: CollabSearchInput[]
): Map<string, ProjectSearchState | null> {
  const scope = newestIds(
    rows.filter((r) => (r.index_chunk_count ?? 0) > 0),
    PROJECT_COLLAB_SEARCH_CAP
  );
  return new Map(rows.map((r) => [r.id, deriveCollabSearchState(r, scope.has(r.id))]));
}
