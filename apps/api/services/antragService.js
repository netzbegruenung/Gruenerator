// Lazily import ESM PostgresService from CJS when needed

/**
 * Saves a new Antrag to the PostgreSQL database.
 * @param {object} antragData - The data for the new Antrag.
 * @param {string} antragData.title - The title of the Antrag.
 * @param {string} [antragData.description] - A short description.
 * @param {string} antragData.antragstext - The main content of the Antrag (Markdown).
 * @param {string} [antragData.status='draft'] - The initial status.
 * @param {string} [antragData.user_id] - Optional user ID.
 * @returns {Promise<object>} The inserted data or throws an error.
 */
async function saveAntragToDatabase(antragData) {
  const { getPostgresInstance } = await import('../database/services/PostgresService.js');
  const db = getPostgresInstance();
  await db.ensureInitialized();

  // Destructure data fields
  const { 
    title, 
    description, 
    antragstext, 
    status = 'draft', 
    user_id, 
    antragsteller,
    kontakt_email, 
    kontakt_erlaubt,
    is_private = false
  } = antragData;

  // Basic validation
  if (!antragstext || typeof antragstext !== 'string' || antragstext.trim() === '') {
    throw new Error('Antragstext is required and cannot be empty.');
  }
  if (!title || typeof title !== 'string' || title.trim() === '') {
    throw new Error('Title is required and cannot be empty.');
  }

  const dataToInsert = {
    title: title.trim(),
    content: antragstext.trim(), // Map antragstext to content field
    status,
    user_id: user_id || null,
    metadata: {
      description: description ? description.trim() : null,
      antragsteller: antragsteller || null,
      kontakt_email: kontakt_email || null,
      kontakt_erlaubt: typeof kontakt_erlaubt === 'boolean' ? kontakt_erlaubt : false,
      is_private: typeof is_private === 'boolean' ? is_private : false
    }
  };

  console.log('[AntragService] Inserting Antrag:', dataToInsert);

  try {
    const result = await db.insert('antraege', dataToInsert);
    console.log('[AntragService] Antrag successfully inserted:', result);
    return result.data[0];
  } catch (error) {
    console.error('[AntragService] Error inserting Antrag:', error);
    if (error.code === '23503') {
      throw new Error('Invalid user ID provided.');
    }
    throw new Error(error.message || 'Failed to save Antrag to the database.');
  }
}

/**
 * Retrieves all Anträge for a specific user from the PostgreSQL database.
 * @param {string} userId - The ID of the user whose Anträge should be retrieved.
 * @returns {Promise<Array<object>>} An array of Anträge objects or throws an error.
 */
async function getAntraegeByUserId(userId) {
  // Validate userId
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid user ID provided.');
  }

  console.log(`[AntragService] Fetching Anträge for user ID: ${userId}`);

  try {
    const { getPostgresInstance } = await import('../database/services/PostgresService.js');
    const db = getPostgresInstance();
    await db.ensureInitialized();

    const result = await db.query(
      'SELECT * FROM antraege WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    const data = result.data || [];
    console.log(`[AntragService] Successfully fetched ${data.length} Anträge for user ${userId}.`);
    return data;
  } catch (error) {
    console.error(`[AntragService] Error fetching Anträge for user ${userId}:`, error);
    throw new Error(error.message || 'Failed to fetch Anträge from the database.');
  }
}

/**
 * Deletes an Antrag by its ID, ensuring the user owns the Antrag.
 * @param {string|number} antragId - The ID of the Antrag to delete.
 * @param {string} userId - The ID of the user attempting to delete the Antrag.
 * @returns {Promise<void>} Resolves if deletion is successful, otherwise throws an error.
 */
async function deleteAntragById(antragId, userId) {
  // Validate input
  if (!antragId) {
    throw new Error('Antrag ID is required for deletion.');
  }
  if (!userId) {
    throw new Error('User ID is required for deletion authorization.');
  }

  console.log(`[AntragService] Attempting to delete Antrag ID: ${antragId} by user ID: ${userId}`);

  try {
    const { getPostgresInstance } = await import('../database/services/PostgresService.js');
    const db = getPostgresInstance();
    await db.ensureInitialized();

    // Delete with both ID and user ID match for security
    const result = await db.delete('antraege', { 
      id: antragId, 
      user_id: userId 
    });

    console.log(`[AntragService] Antrag ID ${antragId} deleted by user ${userId}`);
  } catch (error) {
    console.error(`[AntragService] Error deleting Antrag ID ${antragId} for user ${userId}:`, error);
    throw new Error(error.message || 'Failed to delete Antrag.');
  }
}

// Add other functions like getAntragById, listAntraegeByUser etc. here later

export {
  saveAntragToDatabase,
  saveAntragToDatabase as saveAntragToSupabase,
  getAntraegeByUserId,
  deleteAntragById
};