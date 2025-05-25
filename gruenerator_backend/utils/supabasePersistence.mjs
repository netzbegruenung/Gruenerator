import * as Y from 'yjs';
import pako from 'pako';
import { supabaseService } from './supabaseClient.js'; // Use .js extension if that's the actual filename

const DEBOUNCE_TIMEOUT = 2000; // Millisekunden für Debouncing von Updates
const debouncedUpdates = new Map(); // documentId -> { timeoutId, updates: [] }

async function writeUpdatesToDb(documentId, updatesToStore) {
  if (!updatesToStore || updatesToStore.length === 0) return;

  const records = updatesToStore.map(updateEntry => ({
    document_id: documentId,
    update_data: updateEntry.updateData, // Bereits Buffer/Uint8Array durch pako
    client_id: updateEntry.clientId,
  }));

  try {
    const { error } = await supabaseService
      .from('yjs_document_updates')
      .insert(records);
    if (error) {
      console.error(`[SupabasePersistence] Error inserting ${records.length} updates for doc ${documentId}:`, error);
      // Implement more robust error handling/retry if needed
    }
  } catch (e) {
    console.error(`[SupabasePersistence] Exception during insert for doc ${documentId}:`, e);
  }
}

export const supabasePersistence = {
  bindState: async (documentId, ydoc) => {
    console.log(`[SupabasePersistence] bindState called for documentId: ${documentId}`);
    let snapshotSourceUpdateCreatedAt = null;

    // 1. Get latest snapshot
    try {
      const { data: snapshotData, error: snapshotError } = await supabaseService
        .from('yjs_document_snapshots')
        .select('snapshot_data, snapshot_source_update_created_at')
        .eq('document_id', documentId)
        .maybeSingle(); // Use maybeSingle() if it's possible no snapshot exists

      if (snapshotError) {
        console.error(`[SupabasePersistence] Error fetching snapshot for doc ${documentId}:`, snapshotError);
      } else if (snapshotData && snapshotData.snapshot_data) {
        console.log(`[SupabasePersistence] Applying snapshot for doc ${documentId}`);
        const decompressedSnapshot = pako.inflate(snapshotData.snapshot_data);
        Y.applyUpdate(ydoc, decompressedSnapshot, supabasePersistence); // Pass origin to prevent echo
        snapshotSourceUpdateCreatedAt = snapshotData.snapshot_source_update_created_at;
      }
    } catch (e) {
      console.error(`[SupabasePersistence] Exception fetching snapshot for doc ${documentId}:`, e);
    }

    // 2. Get updates after snapshot (or all if no snapshot)
    try {
      let query = supabaseService
        .from('yjs_document_updates')
        .select('update_data, created_at')
        .eq('document_id', documentId)
        .order('created_at', { ascending: true });

      if (snapshotSourceUpdateCreatedAt) {
        query = query.gt('created_at', snapshotSourceUpdateCreatedAt);
      }

      const { data: updates, error: updatesError } = await query;

      if (updatesError) {
        console.error(`[SupabasePersistence] Error fetching updates for doc ${documentId}:`, updatesError);
      } else if (updates) {
        console.log(`[SupabasePersistence] Applying ${updates.length} updates for doc ${documentId} (after snapshot: ${!!snapshotSourceUpdateCreatedAt})`);
        updates.forEach(upd => {
          const decompressedUpdate = pako.inflate(upd.update_data);
          Y.applyUpdate(ydoc, decompressedUpdate, supabasePersistence); // Pass origin
        });
      }
    } catch (e) {
      console.error(`[SupabasePersistence] Exception fetching updates for doc ${documentId}:`, e);
    }

    // 3. Listen for new updates from ydoc
    ydoc.on('update', (update, origin, doc) => {
      if (origin === supabasePersistence) {
        return; // Don't store updates that came from the persistence layer itself
      }
      console.log(`[SupabasePersistence] 'update' event on ydoc for documentId: ${documentId}. Origin: ${origin ? origin.constructor.name : 'null'}`);
      
      const compressedUpdate = pako.deflate(update);
      const clientId = origin && typeof origin === 'object' && origin.clientID ? String(origin.clientID) : null;

      if (!debouncedUpdates.has(documentId)) {
        debouncedUpdates.set(documentId, { timeoutId: null, updates: [] });
      }
      const docDebounceState = debouncedUpdates.get(documentId);
      docDebounceState.updates.push({ updateData: compressedUpdate, clientId });

      if (docDebounceState.timeoutId) {
        clearTimeout(docDebounceState.timeoutId);
      }

      docDebounceState.timeoutId = setTimeout(async () => {
        const updatesToStore = [...docDebounceState.updates];
        docDebounceState.updates = []; // Clear for next batch
        debouncedUpdates.delete(documentId); // Or just clear timeoutId if you want to keep the map entry
        
        console.log(`[SupabasePersistence] Debounce triggered for doc ${documentId}. Storing ${updatesToStore.length} updates.`);
        await writeUpdatesToDb(documentId, updatesToStore);
      }, DEBOUNCE_TIMEOUT);
    });
    console.log(`[SupabasePersistence] Attached 'update' listener to ydoc for documentId: ${documentId}`);
  },

  writeState: async (documentId, ydoc) => {
    // This function is called by y-websocket when all connections to a document are closed.
    // It's a good opportunity to ensure all pending debounced updates are flushed.
    console.log(`[SupabasePersistence] writeState called for documentId: ${documentId}. Flushing any pending updates.`);
    
    const docDebounceState = debouncedUpdates.get(documentId);
    if (docDebounceState && docDebounceState.updates.length > 0) {
      if (docDebounceState.timeoutId) {
        clearTimeout(docDebounceState.timeoutId);
      }
      const updatesToStore = [...docDebounceState.updates];
      docDebounceState.updates = [];
      debouncedUpdates.delete(documentId);

      console.log(`[SupabasePersistence] Flushing ${updatesToStore.length} updates from writeState for doc ${documentId}.`);
      await writeUpdatesToDb(documentId, updatesToStore);
    } else {
      console.log(`[SupabasePersistence] No pending updates to flush for doc ${documentId} during writeState.`);
    }
    // The actual snapshotting is handled by a separate Supabase Edge Function as per the plan.
    // This function primarily ensures that recent changes are not lost if the server/doc instance is about to be destroyed.
    return Promise.resolve();
  },

  // Optional: Clear an interval or timeout when a document is destroyed if you were using one
  clearDocument: async (documentId) => {
    console.log(`[SupabasePersistence] clearDocument called for ${documentId}`);
    const docDebounceState = debouncedUpdates.get(documentId);
    if (docDebounceState && docDebounceState.timeoutId) {
      clearTimeout(docDebounceState.timeoutId);
    }
    debouncedUpdates.delete(documentId);
    return Promise.resolve();
  }
}; 