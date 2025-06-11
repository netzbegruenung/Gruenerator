const { supabaseService } = require('../utils/supabaseClient');

/**
 * Saves a new Antrag to the Supabase database.
 * @param {object} antragData - The data for the new Antrag.
 * @param {string} antragData.title - The title of the Antrag.
 * @param {string} [antragData.description] - A short description.
 * @param {string} antragData.antragstext - The main content of the Antrag (Markdown).
 * @param {string} [antragData.status='draft'] - The initial status.
 * @param {string} [antragData.user_id] - Optional user ID.
 * @returns {Promise<object>} The inserted data or throws an error.
 */
async function saveAntragToSupabase(antragData) {
  // Ensure the service client is available
  if (!supabaseService) {
    throw new Error('Supabase service client is not initialized. Check SUPABASE_SERVICE_ROLE_KEY.');
  }

  // Destructure is_private, defaulting to false if not provided or undefined
  const { 
    title, 
    description, 
    antragstext, 
    status = 'draft', 
    user_id, 
    antragsteller, // Capture potentially unused fields if needed elsewhere
    kontakt_email, 
    kontakt_erlaubt,
    is_private = false // Default to false
  } = antragData;

  // Basic validation
  if (!antragstext || typeof antragstext !== 'string' || antragstext.trim() === '') {
    throw new Error('Antragstext is required and cannot be empty.');
  }
  if (!title || typeof title !== 'string' || title.trim() === '') {
    throw new Error('Title is required and cannot be empty.');
  }
  if (typeof is_private !== 'boolean') {
    // Optional: Add type validation if strictness is desired
    console.warn('[AntragService] is_private is not a boolean, defaulting to false.');
  }

  const dataToInsert = {
    title: title.trim(),
    description: description ? description.trim() : null,
    antragstext: antragstext.trim(),
    status,
    // Only include user_id if it's provided
    ...(user_id && { user_id }),
    antragsteller: antragsteller || null, // Include from popup
    kontakt_email: kontakt_email || null, // Include from popup
    kontakt_erlaubt: typeof kontakt_erlaubt === 'boolean' ? kontakt_erlaubt : false, // Include from popup, ensure boolean
    is_private: typeof is_private === 'boolean' ? is_private : false // Ensure boolean type
  };

  console.log('[AntragService] Inserting Antrag:', dataToInsert);

  const { data, error } = await supabaseService
    .from('antraege') // Make sure 'antraege' table exists
    .insert([dataToInsert])
    .select() // Return the inserted row(s)
    .single(); // Expecting a single row back

  if (error) {
    console.error('[AntragService] Error inserting Antrag:', error);
    // Provide more specific error messages if possible
    if (error.code === '23503') { // Foreign key violation (e.g., user_id doesn't exist)
        throw new Error('Invalid user ID provided.');
    }
    if (error.code === '42P01') { // Table does not exist
        throw new Error("Database error: 'antraege' table not found.");
    }
    // Add handling for invalid enum value for 'status' if needed
    if (error.message.includes('invalid input value for enum antrag_status')) {
        throw new Error(`Invalid status value provided: ${status}`);
    }
    throw new Error(error.message || 'Failed to save Antrag to the database.');
  }

  console.log('[AntragService] Antrag successfully inserted:', data);
  return data;
}

/**
 * Retrieves all Anträge for a specific user from the Supabase database.
 * @param {string} userId - The ID of the user whose Anträge should be retrieved.
 * @returns {Promise<Array<object>>} An array of Anträge objects or throws an error.
 */
async function getAntraegeByUserId(userId) {
  // Ensure the service client is available
  if (!supabaseService) {
    throw new Error('Supabase service client is not initialized. Cannot fetch Anträge.');
  }

  // Validate userId
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid user ID provided.');
  }

  console.log(`[AntragService] Fetching Anträge for user ID: ${userId}`);

  const { data, error } = await supabaseService
    .from('antraege')
    .select('*') // Select all columns, adjust as needed
    .eq('user_id', userId)
    .order('created_at', { ascending: false }); // Optional: Order by creation date, newest first

  if (error) {
    console.error(`[AntragService] Error fetching Anträge for user ${userId}:`, error);
    // Handle specific errors if needed, e.g., table not found
    if (error.code === '42P01') { // Table does not exist
        throw new Error("Database error: 'antraege' table not found.");
    }
    throw new Error(error.message || 'Failed to fetch Anträge from the database.');
  }

  console.log(`[AntragService] Successfully fetched ${data.length} Anträge for user ${userId}.`);
  return data || []; // Return data or an empty array if null/undefined
}

/**
 * Deletes an Antrag by its ID, ensuring the user owns the Antrag.
 * @param {string|number} antragId - The ID of the Antrag to delete.
 * @param {string} userId - The ID of the user attempting to delete the Antrag.
 * @returns {Promise<void>} Resolves if deletion is successful, otherwise throws an error.
 */
async function deleteAntragById(antragId, userId) {
  // Ensure the service client is available
  if (!supabaseService) {
    throw new Error('Supabase service client is not initialized. Cannot delete Antrag.');
  }

  // Validate input
  if (!antragId) {
    throw new Error('Antrag ID is required for deletion.');
  }
  if (!userId) {
    throw new Error('User ID is required for deletion authorization.');
  }

  console.log(`[AntragService] Attempting to delete Antrag ID: ${antragId} by user ID: ${userId}`);

  // We perform the delete operation directly with a user_id match condition.
  // This leverages database constraints and RLS (if configured) for atomicity and security.
  const { data, error } = await supabaseService
    .from('antraege')
    .delete()
    .match({ id: antragId, user_id: userId }); // Match both ID and user ID

  // Note: Supabase delete returns an empty data array on success by default.
  // The `error` object tells us if something went wrong.

  if (error) {
    console.error(`[AntragService] Error deleting Antrag ID ${antragId} for user ${userId}:`, error);
    if (error.code === '42P01') { // Table does not exist
        throw new Error("Database error: 'antraege' table not found.");
    }
    // We don't need to explicitly check `count` here because if the match fails
    // (either Antrag doesn't exist or user doesn't own it), Supabase delete
    // operation does nothing and doesn't return an error unless there's a
    // different problem (like DB connection or policy violation if RLS is strict).
    // If RLS is properly set up, it might return a specific permission error code.
    throw new Error(error.message || 'Failed to delete Antrag.');
  }

  // Optional: Check if any rows were actually deleted. `data` is usually empty/null on success.
  // A more robust check might involve querying before deleting or relying on RLS errors.
  // For now, we assume success if no error occurred.
  console.log(`[AntragService] Antrag ID ${antragId} potentially deleted by user ${userId}. (Check RLS/DB logs if needed)`);

  // No return value needed for successful deletion
}

// Add other functions like getAntragById, listAntraegeByUser etc. here later

module.exports = {
  saveAntragToSupabase,
  getAntraegeByUserId,
  deleteAntragById,
}; 