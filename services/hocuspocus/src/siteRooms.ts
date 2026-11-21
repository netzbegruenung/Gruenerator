import * as Y from 'yjs';

import type { DbQueryFn } from './types.js';

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

// Duplicated from @gruenerator/contracts `siteYdoc.ts` (SITE_YDOC_KEYS): this service keeps no
// cross-package deps beyond @gruenerator/shared.
const SITE_META = 'siteMeta';
const SITE_FIELDS = 'siteFields';
const SITE_BLOCK_ORDER = 'siteBlockOrder';

/**
 * Whether the doc holds a seed of the block layout (contracts `isSiteDocSeeded`): only such a
 * seed writes the block order, and the hero keeps it from ever being empty again. The meta is
 * no mark: an old editor tab writes its own meta back, and Yjs may keep the old version.
 */
function hasCurrentSeed(doc: Y.Doc): boolean {
  return doc.getArray(SITE_BLOCK_ORDER).length > 0;
}

/**
 * Seeds a doc that holds no seed of the current layout. Check and apply run in one tick of this
 * process, so a repeated seed cannot duplicate content. A doc with state but no current seed is
 * seeded too: an editor tab left open across a layout change writes the old keys back, and
 * refusing would lock the draft for good. The old keys stay behind unread.
 */
export function applySiteSeed(doc: Y.Doc, update: Uint8Array): boolean {
  if (hasCurrentSeed(doc)) return false;
  const hadState = doc.store.clients.size > 0;
  Y.applyUpdate(doc, update);
  // Over existing state the seed's map entries are concurrent with the old ones, and Yjs keeps
  // the one of the higher client id, not the newer one: the old schema version could win and
  // every later prepare would seed again. Writing the seed's values once more here puts them
  // causally after both, so they hold.
  if (hadState) {
    const seed = new Y.Doc();
    try {
      Y.applyUpdate(seed, update);
      doc.transact(() => {
        for (const key of [SITE_META, SITE_FIELDS]) {
          const target = doc.getMap(key);
          for (const [entry, value] of seed.getMap(key).entries()) target.set(entry, value);
        }
      });
    } finally {
      seed.destroy();
    }
  }
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

/**
 * Whether a bare id belongs to any `user_sites` row, trashed or not: such an id
 * must never open a document, because a site's Yjs rows are keyed by it (#5805).
 */
export async function isSiteId(db: DbQueryFn, id: string): Promise<boolean> {
  if (!UUID_RE.test(id.toLowerCase())) return false;
  const rows = await db('SELECT 1 FROM user_sites WHERE id = $1 LIMIT 1', [id.toLowerCase()]);
  return rows.length > 0;
}

/** Whether the site still exists and is not in the trash. */
export async function siteIsLive(db: DbQueryFn, siteId: string): Promise<boolean> {
  const rows = await db('SELECT 1 FROM user_sites WHERE id = $1 AND deleted_at IS NULL LIMIT 1', [
    siteId,
  ]);
  return rows.length > 0;
}
