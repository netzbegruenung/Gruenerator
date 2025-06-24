import * as Y from 'yjs';
import pako from 'pako';
import { supabaseService } from './supabaseClient.js'; // Use .js extension if that's the actual filename
import { DailyVersionService } from '../services/dailyVersionService.js';

const DEBOUNCE_TIMEOUT = 2000; // Millisekunden für Debouncing von Updates
const debouncedUpdates = new Map(); // documentId -> { timeoutId, updates: [] }

async function ensureDocumentExists(documentId) {
  try {
    // Check if document exists in collaborative_documents table
    const { data: existingDoc, error: checkError } = await supabaseService
      .from('collaborative_documents')
      .select('id')
      .eq('id', documentId)
      .maybeSingle();

    if (checkError) {
      console.error(`[SupabasePersistence] Error checking document existence for ${documentId}:`, checkError);
      return false;
    }

    if (!existingDoc) {
      // Document doesn't exist, create it
      console.log(`[SupabasePersistence] Document ${documentId} not found in collaborative_documents, creating entry...`);
      
      const { error: insertError } = await supabaseService
        .from('collaborative_documents')
        .insert([{ 
          id: documentId,
          entity_type: 'collaborative_document',
          entity_id: documentId,
          title: 'Collaborative Document',
          initial_content_provided: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);

      if (insertError) {
        console.error(`[SupabasePersistence] Error creating document entry for ${documentId}:`, insertError);
        return false;
      }
      
      console.log(`[SupabasePersistence] Successfully created document entry for ${documentId}`);
    }
    
    return true;
  } catch (e) {
    console.error(`[SupabasePersistence] Exception ensuring document exists for ${documentId}:`, e);
    return false;
  }
}

async function writeUpdatesToDb(documentId, updatesToStore) {
  if (!updatesToStore || updatesToStore.length === 0) return;

  // Ensure the document exists in collaborative_documents before inserting updates
  const documentExists = await ensureDocumentExists(documentId);
  if (!documentExists) {
    console.error(`[SupabasePersistence] Cannot insert updates for ${documentId}: document entry creation failed`);
    return;
  }

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
    } else {
      console.log(`[SupabasePersistence] Successfully inserted ${records.length} updates for doc ${documentId}`);
    }
  } catch (e) {
    console.error(`[SupabasePersistence] Exception during insert for doc ${documentId}:`, e);
  }
}

export const supabasePersistence = {
  bindState: async (documentId, ydoc) => {
    console.log(`[SupabasePersistence] bindState called for documentId: ${documentId}`);
    
    // Ensure document exists in collaborative_documents table
    const documentExists = await ensureDocumentExists(documentId);
    if (!documentExists) {
      console.error(`[SupabasePersistence] Cannot bind state for ${documentId}: document entry creation failed`);
      return; // Don't proceed with binding if we can't ensure the document exists
    }
    
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
    
    // Create daily version if this is the first time someone opens the document today
    // Do this asynchronously to not block the binding process
    setTimeout(async () => {
      try {
        await DailyVersionService.ensureDailyVersion(documentId, ydoc);
      } catch (error) {
        console.error(`[SupabasePersistence] Error creating daily version for ${documentId}:`, error);
      }
    }, 1000); // Small delay to ensure document is fully loaded
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
  },

  // Cleanup function for graceful shutdown
  cleanup: async () => {
    const startTime = Date.now();
    console.log(`[SupabasePersistence] Cleanup started. Processing ${debouncedUpdates.size} pending document updates...`);
    
    if (debouncedUpdates.size === 0) {
      console.log(`[SupabasePersistence] No pending updates to process. Cleanup completed in ${Date.now() - startTime}ms`);
      return;
    }
    
    // Process all pending updates immediately
    const cleanupPromises = [];
    let totalTimeouts = 0;
    let totalUpdates = 0;
    
    for (const [documentId, docDebounceState] of debouncedUpdates.entries()) {
      console.log(`[SupabasePersistence] Processing document ${documentId}...`);
      
      if (docDebounceState.timeoutId) {
        clearTimeout(docDebounceState.timeoutId);
        totalTimeouts++;
        console.log(`[SupabasePersistence] Cleared timeout for document ${documentId}`);
      }
      
      if (docDebounceState.updates.length > 0) {
        totalUpdates += docDebounceState.updates.length;
        console.log(`[SupabasePersistence] Flushing ${docDebounceState.updates.length} pending updates for doc ${documentId}`);
        const updatesToStore = [...docDebounceState.updates];
        cleanupPromises.push(
          writeUpdatesToDb(documentId, updatesToStore)
            .then(() => console.log(`[SupabasePersistence] Successfully flushed updates for doc ${documentId}`))
            .catch(err => console.error(`[SupabasePersistence] Failed to flush updates for doc ${documentId}:`, err))
        );
      } else {
        console.log(`[SupabasePersistence] No pending updates for document ${documentId}`);
      }
    }
    
    console.log(`[SupabasePersistence] Cleared ${totalTimeouts} timeouts, processing ${totalUpdates} total updates across ${cleanupPromises.length} documents`);
    
    // Clear the map
    debouncedUpdates.clear();
    console.log(`[SupabasePersistence] Cleared debouncedUpdates map`);
    
    // Wait for all pending updates to be written
    console.log(`[SupabasePersistence] Waiting for ${cleanupPromises.length} database operations to complete...`);
    const results = await Promise.allSettled(cleanupPromises);
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`[SupabasePersistence] Database operations completed: ${successful} successful, ${failed} failed`);
    
    if (failed > 0) {
      console.error(`[SupabasePersistence] ${failed} database operations failed during cleanup`);
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`[SupabasePersistence] Failed operation ${index + 1}:`, result.reason);
        }
      });
    }
    
    const duration = Date.now() - startTime;
    console.log(`[SupabasePersistence] Cleanup completed successfully in ${duration}ms`);
  }
}; 