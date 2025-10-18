/**
 * Service for managing user's recent form values
 * Provides functionality to save, retrieve, and manage recent form field inputs
 */

/**
 * Saves a recent value for a user and field type
 * @param {string} userId - The user ID
 * @param {string} fieldType - The type of field (e.g., 'gliederung', 'details', etc.)
 * @param {string} fieldValue - The value to save
 * @param {string} [formName] - Optional form name for context
 * @returns {Promise<object>} The saved record
 */
async function saveRecentValue(userId, fieldType, fieldValue, formName = null) {
  const { getPostgresInstance } = await import('../database/services/PostgresService.js');
  const db = getPostgresInstance();
  await db.ensureInitialized();

  // Validate input
  if (!userId || typeof userId !== 'string') {
    throw new Error('Valid user ID is required');
  }
  if (!fieldType || typeof fieldType !== 'string') {
    throw new Error('Valid field type is required');
  }
  if (!fieldValue || typeof fieldValue !== 'string' || fieldValue.trim() === '') {
    throw new Error('Valid field value is required');
  }

  const trimmedValue = fieldValue.trim();

  // Check if this exact value already exists for this user/field
  const existingResult = await db.query(
    'SELECT id FROM user_recent_values WHERE user_id = $1 AND field_type = $2 AND field_value = $3',
    [userId, fieldType, trimmedValue]
  );

  if (existingResult && existingResult.length > 0) {
    // Update the created_at timestamp to move it to the top
    const updateResult = await db.query(
      'UPDATE user_recent_values SET created_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [existingResult[0].id]
    );
    return updateResult[0];
  }

  // Insert new value
  const dataToInsert = {
    user_id: userId,
    field_type: fieldType,
    field_value: trimmedValue,
    form_name: formName
  };

  try {
    const result = await db.insert('user_recent_values', dataToInsert);
    return result;
  } catch (error) {
    console.error('[RecentValuesService] Error saving recent value:', error);
    if (error.code === '23503') {
      throw new Error('Invalid user ID provided');
    }
    throw new Error(error.message || 'Failed to save recent value');
  }
}

/**
 * Retrieves recent values for a user and field type
 * @param {string} userId - The user ID
 * @param {string} fieldType - The type of field
 * @param {number} [limit=5] - Number of recent values to retrieve
 * @returns {Promise<Array>} Array of recent values
 */
async function getRecentValues(userId, fieldType, limit = 5) {
  const { getPostgresInstance } = await import('../database/services/PostgresService.js');
  const db = getPostgresInstance();
  await db.ensureInitialized();

  // Validate input
  if (!userId || typeof userId !== 'string') {
    throw new Error('Valid user ID is required');
  }
  if (!fieldType || typeof fieldType !== 'string') {
    throw new Error('Valid field type is required');
  }

  const safeLimit = Math.min(Math.max(parseInt(limit) || 5, 1), 20); // Limit between 1-20

  try {
    const result = await db.query(
      `SELECT field_value, form_name, created_at
       FROM user_recent_values
       WHERE user_id = $1 AND field_type = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, fieldType, safeLimit]
    );

    return result || [];
  } catch (error) {
    console.error(`[RecentValuesService] Error retrieving recent values for ${fieldType}:`, error);
    throw new Error(error.message || 'Failed to retrieve recent values');
  }
}

/**
 * Clears all recent values for a user and field type
 * @param {string} userId - The user ID
 * @param {string} fieldType - The type of field
 * @returns {Promise<number>} Number of deleted records
 */
async function clearRecentValues(userId, fieldType) {
  const { getPostgresInstance } = await import('../database/services/PostgresService.js');
  const db = getPostgresInstance();
  await db.ensureInitialized();

  // Validate input
  if (!userId || typeof userId !== 'string') {
    throw new Error('Valid user ID is required');
  }
  if (!fieldType || typeof fieldType !== 'string') {
    throw new Error('Valid field type is required');
  }

  try {
    const result = await db.delete('user_recent_values', {
      user_id: userId,
      field_type: fieldType
    });

    return result.rowCount || 0;
  } catch (error) {
    console.error(`[RecentValuesService] Error clearing recent values for ${fieldType}:`, error);
    throw new Error(error.message || 'Failed to clear recent values');
  }
}

/**
 * Gets all field types that have recent values for a user
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} Array of field types with counts
 */
async function getFieldTypesWithCounts(userId) {
  const { getPostgresInstance } = await import('../database/services/PostgresService.js');
  const db = getPostgresInstance();
  await db.ensureInitialized();

  // Validate input
  if (!userId || typeof userId !== 'string') {
    throw new Error('Valid user ID is required');
  }

  try {
    const result = await db.query(
      `SELECT field_type, COUNT(*) as value_count, MAX(created_at) as last_used
       FROM user_recent_values
       WHERE user_id = $1
       GROUP BY field_type
       ORDER BY last_used DESC`,
      [userId]
    );

    return result || [];
  } catch (error) {
    console.error('[RecentValuesService] Error retrieving field types:', error);
    throw new Error(error.message || 'Failed to retrieve field types');
  }
}

module.exports = {
  saveRecentValue,
  getRecentValues,
  clearRecentValues,
  getFieldTypesWithCounts
};