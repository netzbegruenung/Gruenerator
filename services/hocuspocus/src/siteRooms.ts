import * as Y from 'yjs';

/**
 * Site drafts (#5789) live in the room `site-<user_sites.id>`. Their Yjs rows are
 * keyed by the bare uuid, because `yjs_document_*.document_id` is a UUID column.
 */
export const SITE_ROOM_PREFIX = 'site-';

/** A site draft larger than this is not persisted. */
export const SITE_DOC_MAX_BYTES = 2 * 1024 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function siteIdFromRoom(room: string): string | null {
  if (!room.startsWith(SITE_ROOM_PREFIX)) return null;
  const id = room.slice(SITE_ROOM_PREFIX.length);
  return UUID_RE.test(id) ? id : null;
}

export function persistenceKey(room: string): string {
  return siteIdFromRoom(room) ?? room;
}

/** Seeds only a doc that has never held state, so a repeated seed cannot duplicate content. */
export function applySiteSeed(doc: Y.Doc, update: Uint8Array): boolean {
  if (doc.store.clients.size > 0) return false;
  Y.applyUpdate(doc, update);
  return true;
}
