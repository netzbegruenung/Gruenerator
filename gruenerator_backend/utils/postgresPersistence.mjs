import * as Y from 'yjs';
import pako from 'pako';
import { getPostgresInstance } from '../database/services/PostgresService.js';

const pg = getPostgresInstance();

const DEBOUNCE_TIMEOUT = 2000; // ms debounce window for update batching
const debouncedUpdates = new Map(); // documentId -> { timeoutId, updates: [] }

async function ensureDocumentExists(documentId) {
  try {
    const existing = await pg.queryOne(
      'SELECT id FROM collaborative_documents WHERE id = $1',
      [documentId]
    );
    if (existing) return true;

    // Insert minimal viable row for our schema (title is required)
    await pg.insert('collaborative_documents', {
      id: documentId,
      title: 'Collaborative Document'
    });
    return true;
  } catch (e) {
    console.error(`[PostgresPersistence] ensureDocumentExists failed for ${documentId}:`, e);
    return false;
  }
}

async function writeUpdatesToDb(documentId, updatesToStore) {
  if (!updatesToStore || updatesToStore.length === 0) return;

  const ok = await ensureDocumentExists(documentId);
  if (!ok) {
    console.error(`[PostgresPersistence] Cannot insert updates for ${documentId}: ensureDocumentExists failed`);
    return;
  }

  const records = updatesToStore.map(u => ({
    document_id: documentId,
    // Ensure bytea by wrapping into Buffer (pg converts Buffer->bytea)
    update_data: Buffer.isBuffer(u.updateData) ? u.updateData : Buffer.from(u.updateData),
    client_id: u.clientId ? Number(u.clientId) : null,
  }));

  try {
    await pg.bulkInsert('yjs_document_updates', records);
    console.log(`[PostgresPersistence] Inserted ${records.length} updates for doc ${documentId}`);
  } catch (e) {
    console.error(`[PostgresPersistence] Error inserting updates for doc ${documentId}:`, e);
  }
}

export const postgresPersistence = {
  bindState: async (documentId, ydoc) => {
    console.log(`[PostgresPersistence] bindState for ${documentId}`);

    // 1) Ensure base row exists
    const ok = await ensureDocumentExists(documentId);
    if (!ok) {
      console.error(`[PostgresPersistence] Aborting bindState; could not ensure document ${documentId}`);
      return;
    }

    // 2) Load latest snapshot (by version, fallback to created_at)
    let snapshotCreatedAt = null;
    try {
      const snapshot = await pg.queryOne(
        `SELECT snapshot_data, created_at
         FROM yjs_document_snapshots
         WHERE document_id = $1
         ORDER BY version DESC, created_at DESC
         LIMIT 1`,
        [documentId]
      );
      if (snapshot && snapshot.snapshot_data) {
        console.log(`[PostgresPersistence] Applying snapshot for ${documentId}`);
        const decompressed = pako.inflate(snapshot.snapshot_data);
        Y.applyUpdate(ydoc, decompressed, postgresPersistence);
        snapshotCreatedAt = snapshot.created_at;
      }
    } catch (e) {
      console.error(`[PostgresPersistence] Failed loading snapshot for ${documentId}:`, e);
    }

    // 3) Load updates after snapshot (or all)
    try {
      let updates;
      if (snapshotCreatedAt) {
        updates = await pg.query(
          `SELECT update_data
           FROM yjs_document_updates
           WHERE document_id = $1 AND created_at > $2
           ORDER BY created_at ASC`,
          [documentId, snapshotCreatedAt]
        );
      } else {
        updates = await pg.query(
          `SELECT update_data
           FROM yjs_document_updates
           WHERE document_id = $1
           ORDER BY created_at ASC`,
          [documentId]
        );
      }

      if (updates && updates.length) {
        console.log(`[PostgresPersistence] Applying ${updates.length} updates for ${documentId}`);
        for (const row of updates) {
          const decompressed = pako.inflate(row.update_data);
          Y.applyUpdate(ydoc, decompressed, postgresPersistence);
        }
      }
    } catch (e) {
      console.error(`[PostgresPersistence] Failed loading updates for ${documentId}:`, e);
    }

    // 4) Listen for new updates and debounce writes
    ydoc.on('update', (update, origin) => {
      if (origin === postgresPersistence) return; // ignore our own

      const compressed = pako.deflate(update);
      const clientId = origin && typeof origin === 'object' && origin.clientID ? String(origin.clientID) : null;

      if (!debouncedUpdates.has(documentId)) {
        debouncedUpdates.set(documentId, { timeoutId: null, updates: [] });
      }
      const state = debouncedUpdates.get(documentId);
      state.updates.push({ updateData: compressed, clientId });

      if (state.timeoutId) clearTimeout(state.timeoutId);
      state.timeoutId = setTimeout(async () => {
        const toStore = [...state.updates];
        state.updates = [];
        debouncedUpdates.delete(documentId);
        console.log(`[PostgresPersistence] Debounce flush for ${documentId}: ${toStore.length} updates`);
        await writeUpdatesToDb(documentId, toStore);
      }, DEBOUNCE_TIMEOUT);
    });

    console.log(`[PostgresPersistence] Attached update listener for ${documentId}`);

    // NOTE: DailyVersionService in this repo is Supabase-specific and schema-mismatched.
    // If needed, implement a Postgres-based daily version creator separately.
  },

  writeState: async (documentId /*, ydoc */) => {
    const state = debouncedUpdates.get(documentId);
    if (state && state.updates.length) {
      if (state.timeoutId) clearTimeout(state.timeoutId);
      const toStore = [...state.updates];
      state.updates = [];
      debouncedUpdates.delete(documentId);
      console.log(`[PostgresPersistence] writeState flush for ${documentId}: ${toStore.length} updates`);
      await writeUpdatesToDb(documentId, toStore);
    } else {
      console.log(`[PostgresPersistence] writeState: no pending updates for ${documentId}`);
    }
    return Promise.resolve();
  },

  clearDocument: async (documentId) => {
    const state = debouncedUpdates.get(documentId);
    if (state?.timeoutId) clearTimeout(state.timeoutId);
    debouncedUpdates.delete(documentId);
    return Promise.resolve();
  },

  cleanup: async () => {
    const entries = Array.from(debouncedUpdates.entries());
    if (!entries.length) {
      console.log('[PostgresPersistence] Cleanup: no pending updates');
      return;
    }
    const tasks = [];
    for (const [docId, state] of entries) {
      if (state.timeoutId) clearTimeout(state.timeoutId);
      if (state.updates.length) {
        const toStore = [...state.updates];
        tasks.push(writeUpdatesToDb(docId, toStore));
      }
    }
    debouncedUpdates.clear();
    await Promise.allSettled(tasks);
    console.log('[PostgresPersistence] Cleanup completed');
  }
};

