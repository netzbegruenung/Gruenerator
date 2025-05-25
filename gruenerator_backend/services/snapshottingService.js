const { createClient } = require('@supabase/supabase-js');
const Y = require('yjs');
const pako = require('pako');

// Initialize Supabase client
// Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your .env file
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role key for backend operations

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Service Role Key is not defined in environment variables.');
  // Potentially throw an error or handle this case يناير 
}
const supabase = createClient(supabaseUrl, supabaseKey);

// Define snapshotting constants directly in the code
const SNAPSHOT_INTERVAL_HOURS = 24; // Default to 24 hours
const UPDATES_THRESHOLD_FOR_SNAPSHOT = 50; // Default to 50 updates

/**
 * Identifies documents that require a new snapshot.
 * @returns {Promise<Array<string>>} A list of document IDs that need snapshotting.
 */
async function identifyDocumentsForSnapshotting() {
  console.log('[SnapshottingService] Identifying documents for snapshotting...');
  const documentIdsToSnapshot = new Set();

  // 1. Get all collaborative documents
  const { data: allDocs, error: docsError } = await supabase
    .from('collaborative_documents')
    .select('id, initial_content_provided, updated_at');

  if (docsError) {
    console.error('[SnapshottingService] Error fetching collaborative documents:', docsError.message);
    return [];
  }

  if (!allDocs || allDocs.length === 0) {
    console.log('[SnapshottingService] No collaborative documents found.');
    return [];
  }

  const thresholdDate = new Date(Date.now() - SNAPSHOT_INTERVAL_HOURS * 60 * 60 * 1000).toISOString();

  for (const doc of allDocs) {
    const documentId = doc.id;

    // 2. Get the latest snapshot metadata for this document
    const { data: snapshotMeta, error: metaError } = await supabase
      .from('yjs_document_snapshots')
      .select('created_at, snapshot_source_update_created_at')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (metaError) {
      console.error(`[SnapshottingService] Error fetching snapshot metadata for ${documentId}:`, metaError.message);
      continue; // Skip to next document on error
    }

    let reason = '';
    if (!snapshotMeta) {
      // Case A: No snapshot exists yet
      if (doc.initial_content_provided) {
        reason = 'Initial content provided, but no snapshot exists.';
        documentIdsToSnapshot.add(documentId);
      } else {
        // If no initial content, check if there are any updates at all. 
        // If yes, it means content was added and needs snapshotting.
        const { count: anyUpdatesCount, error: anyUpdatesError } = await supabase
            .from("yjs_document_updates")
            .select("*", { count: "exact", head: true })
            .eq("document_id", documentId)
            .limit(1);
        if (anyUpdatesError) {
            console.error(`[SnapshottingService] Error checking for any updates for ${documentId}:`, anyUpdatesError.message);
        } else if (anyUpdatesCount !== null && anyUpdatesCount > 0) {
            reason = `Document ${documentId} has updates but no snapshot.`;
            documentIdsToSnapshot.add(documentId);
        }
      }
    } else {
      // Case B: Snapshot exists, check other conditions
      if (new Date(snapshotMeta.created_at) < new Date(thresholdDate)) {
        reason = `Last snapshot older than ${SNAPSHOT_INTERVAL_HOURS} hours.`;
        documentIdsToSnapshot.add(documentId);
      } else {
        const { count: newUpdatesCount, error: countError } = await supabase
          .from('yjs_document_updates')
          .select('*', { count: 'exact', head: true })
          .eq('document_id', documentId)
          .gt('created_at', snapshotMeta.snapshot_source_update_created_at);

        if (countError) {
          console.error(`[SnapshottingService] Error counting new updates for ${documentId}:`, countError.message);
        } else if (newUpdatesCount !== null && newUpdatesCount > UPDATES_THRESHOLD_FOR_SNAPSHOT) {
          reason = `Has ${newUpdatesCount} new updates (threshold: ${UPDATES_THRESHOLD_FOR_SNAPSHOT}).`;
          documentIdsToSnapshot.add(documentId);
        }
      }
    }
    if (reason) {
        console.log(`[SnapshottingService] Document ${documentId} flagged for snapshot. Reason: ${reason}`);
    }
  }
  const resultList = Array.from(documentIdsToSnapshot);
  console.log(`[SnapshottingService] Found ${resultList.length} documents to snapshot:`, resultList);
  return resultList;
}

/**
 * Creates and stores a snapshot for a given document ID.
 * @param {string} documentId The ID of the document to snapshot.
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function createAndStoreSnapshot(documentId) {
  console.log(`[SnapshottingService] Creating snapshot for document: ${documentId}`);
  const ydoc = new Y.Doc();
  let lastUpdateTimestampFromSnapshot = new Date(0).toISOString();
  let snapshotLoaded = false;

  // 1. Load the latest snapshot, if any
  const { data: latestSnapshot, error: snapshotError } = await supabase
    .from('yjs_document_snapshots')
    .select('snapshot_data, snapshot_source_update_created_at')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (snapshotError) {
    console.error(`[SnapshottingService] Error fetching latest snapshot for ${documentId}:`, snapshotError.message);
    // Decide if we should proceed or return error. For now, proceed to build from updates.
  }

  if (latestSnapshot && latestSnapshot.snapshot_data) {
    try {
      const decompressedSnapshot = pako.inflate(Buffer.from(latestSnapshot.snapshot_data)); // Assuming snapshot_data is bytea, convert to Buffer
      Y.applyUpdate(ydoc, decompressedSnapshot);
      lastUpdateTimestampFromSnapshot = latestSnapshot.snapshot_source_update_created_at;
      snapshotLoaded = true;
      console.log(`[SnapshottingService] Applied existing snapshot for ${documentId}. Last update in snapshot: ${lastUpdateTimestampFromSnapshot}`);
    } catch (e) {
      console.error(`[SnapshottingService] Error decompressing/applying existing snapshot for ${documentId}:`, e.message);
      lastUpdateTimestampFromSnapshot = new Date(0).toISOString(); // Reset if snapshot was corrupt
      // ydoc might be in an inconsistent state here. Consider re-initializing: ydoc = new Y.Doc();
    }
  }

  // 2. Load subsequent updates
  const { data: updates, error: updatesError } = await supabase
    .from('yjs_document_updates')
    .select('update_data, created_at')
    .eq('document_id', documentId)
    .gt('created_at', lastUpdateTimestampFromSnapshot)
    .order('created_at', { ascending: true });

  if (updatesError) {
    console.error(`[SnapshottingService] Error fetching updates for ${documentId}:`, updatesError.message);
    return { success: false, message: `Failed to fetch updates for ${documentId}.` };
  }

  let appliedUpdatesCount = 0;
  let lastAppliedUpdateTimestamp = lastUpdateTimestampFromSnapshot;

  if (updates && updates.length > 0) {
    for (const update of updates) {
      if (update.update_data) {
        try {
          const decompressedUpdate = pako.inflate(Buffer.from(update.update_data)); // Assuming update_data is bytea
          Y.applyUpdate(ydoc, decompressedUpdate);
          lastAppliedUpdateTimestamp = update.created_at; // Keep track of the latest applied update
          appliedUpdatesCount++;
        } catch (e) {
          console.error(`[SnapshottingService] Error decompressing/applying update for ${documentId} (created_at: ${update.created_at}):`, e.message);
          // Skip corrupted update
        }
      }
    }
    console.log(`[SnapshottingService] Applied ${appliedUpdatesCount} new updates to ydoc for ${documentId}.`);
  }

  // 3. Check if a new snapshot is warranted (e.g. if there were new updates or if it was an initial load)
  if (!snapshotLoaded && appliedUpdatesCount === 0) {
    // If no snapshot was loaded and no updates were applied, it might be an empty document or initial_content_provided but no updates yet.
    // The calling logic `identifyDocumentsForSnapshotting` should already ensure it's worth snapshotting.
    // However, a final check on ydoc emptiness could be done, though `encodeStateAsUpdate` on an empty doc is small.
    console.log(`[SnapshottingService] Document ${documentId} had no existing snapshot and no new updates. Proceeding if identified as needing one.`);
  }

  // 4. Create and compress the new snapshot
  const rawSnapshot = Y.encodeStateAsUpdate(ydoc);
  if (rawSnapshot.byteLength === 0 && appliedUpdatesCount === 0 && !snapshotLoaded) { 
      console.warn(`[SnapshottingService] Generated raw snapshot for ${documentId} is empty and no prior data. Skipping storage unless it was specifically flagged for initial content.`);
      // This check might be too strict if a doc was emptied and needs an empty snapshot saved.
      // However, `identifyDocumentsForSnapshotting` should ensure we only process docs that need it.
      // For now, let's assume if it's empty AND wasn't loaded from a snapshot AND had no updates, it might not need saving.
      // A more robust check would be to see if `initial_content_provided` was true and no snapshot existed.
      return { success: true, message: `Snapshot for ${documentId} was empty and no prior data; not stored.` };
  }
  const compressedSnapshot = pako.deflate(rawSnapshot);

  // 5. Store the new snapshot
  const { error: storeError } = await supabase
    .from('yjs_document_snapshots')
    .upsert({
      document_id: documentId,
      snapshot_data: Buffer.from(compressedSnapshot), // Store as bytea
      snapshot_source_update_created_at: lastAppliedUpdateTimestamp, // Timestamp of the last update included
      created_at: new Date().toISOString(),
    }, { onConflict: 'document_id' });

  if (storeError) {
    console.error(`[SnapshottingService] Error storing snapshot for ${documentId}:`, storeError.message);
    return { success: false, message: `Failed to store snapshot for ${documentId}: ${storeError.message}` };
  }
  console.log(`[SnapshottingService] Successfully stored snapshot for ${documentId}. Last update included: ${lastAppliedUpdateTimestamp}`);

  // 6. Perform Garbage Collection (delete old updates)
  const { error: gcError } = await supabase
    .from('yjs_document_updates')
    .delete()
    .eq('document_id', documentId)
    .lte('created_at', lastAppliedUpdateTimestamp);

  if (gcError) {
    console.error(`[SnapshottingService] Error during garbage collection for ${documentId}:`, gcError.message);
    // Non-critical error, snapshot was stored. Log and continue.
  } else {
    console.log(`[SnapshottingService] Garbage collection successful for ${documentId} up to ${lastAppliedUpdateTimestamp}.`);
  }

  return { success: true, message: `Snapshot created and stored successfully for ${documentId}.` };
}

/**
 * Main function to run the snapshotting process.
 * This will be called by the controller.
 */
async function runSnapshotting() {
  console.log('[SnapshottingService] Starting snapshotting run...');
  const documentsToSnapshot = await identifyDocumentsForSnapshotting();
  let successCount = 0;
  let failureCount = 0;

  if (documentsToSnapshot.length === 0) {
    console.log('[SnapshottingService] No documents require snapshotting at this time.');
    return { message: 'No documents required snapshotting.', successCount, failureCount };
  }

  for (const documentId of documentsToSnapshot) {
    try {
      const result = await createAndStoreSnapshot(documentId);
      if (result.success) {
        successCount++;
      } else {
        failureCount++;
        console.warn(`[SnapshottingService] Failed to create snapshot for ${documentId}: ${result.message}`);
      }
    } catch (error) {
      failureCount++;
      console.error(`[SnapshottingService] Critical error during snapshotting for ${documentId}:`, error);
    }
  }

  console.log(`[SnapshottingService] Snapshotting run finished. Success: ${successCount}, Failures: ${failureCount}`);
  return { message: `Snapshotting run finished. Success: ${successCount}, Failures: ${failureCount}`, successCount, failureCount };
}

module.exports = {
  runSnapshotting,
  // Exporting for potential individual testing if needed
  identifyDocumentsForSnapshotting,
  createAndStoreSnapshot 
}; 