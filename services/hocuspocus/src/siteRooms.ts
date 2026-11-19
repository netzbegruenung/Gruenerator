import * as Y from 'yjs';

/**
 * Site drafts (#5789) live in the room `site-<user_sites.id>`. Their Yjs rows are
 * keyed by the bare uuid, because `yjs_document_*.document_id` is a UUID column.
 */
export const SITE_ROOM_PREFIX = 'site-';

/** A site draft larger than this is not persisted. */
export const SITE_DOC_MAX_BYTES = 2 * 1024 * 1024;

// Lower case only: `site-<UPPER>` and `site-<lower>` would be two live docs over the same rows.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const SITE_NOT_SEEDED = 'Site draft not seeded';
export const SITE_TOO_LARGE = 'Site draft exceeds the size limit';

/** The uuid of a canonical (lower-case) site room, else null. */
export function siteIdFromRoom(room: string): string | null {
  if (!room.startsWith(SITE_ROOM_PREFIX)) return null;
  const id = room.slice(SITE_ROOM_PREFIX.length);
  return UUID_RE.test(id) ? id : null;
}

/** The canonical room of a site id from a trusted caller, or null for a non-uuid. */
export function siteRoomOf(siteId: string): string | null {
  const room = `${SITE_ROOM_PREFIX}${siteId.toLowerCase()}`;
  return siteIdFromRoom(room) ? room : null;
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

/**
 * Why a client may not open a site room yet, or null. A room without state is not
 * seeded: a client must never edit a blank draft, because its first write would
 * block the API seed for good. `liveDoc` is the loaded document, if any.
 */
export async function siteRoomGate(
  liveDoc: Y.Doc | null,
  hasStoredState: () => Promise<boolean>
): Promise<string | null> {
  if (liveDoc) {
    if (liveDoc.store.clients.size === 0) return SITE_NOT_SEEDED;
    return Y.encodeStateAsUpdate(liveDoc).length > SITE_DOC_MAX_BYTES ? SITE_TOO_LARGE : null;
  }
  return (await hasStoredState()) ? null : SITE_NOT_SEEDED;
}
