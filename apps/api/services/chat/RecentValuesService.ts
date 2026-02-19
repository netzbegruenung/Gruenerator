/**
 * Service for managing user's recent form values
 * Provides functionality to save, retrieve, and manage recent form field inputs
 */

import type { RecentValue, FieldTypeWithCount } from './types.js';

/**
 * Saves a recent value for a user and field type
 * @param userId - The user ID
 * @param fieldType - The type of field (e.g., 'gliederung', 'details', etc.)
 * @param fieldValue - The value to save
 * @param formName - Optional form name for context
 * @returns The saved record
 */
export async function saveRecentValue(
  userId: string,
  fieldType: string,
  fieldValue: string,
  formName: string | null = null
): Promise<RecentValue> {
  const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
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

  const dataToUpsert = {
    user_id: userId,
    field_type: fieldType,
    field_value: trimmedValue,
    form_name: formName,
    created_at: new Date(),
  };

  try {
    const result = await db.upsert('user_recent_values', dataToUpsert, [
      'user_id',
      'field_type',
      'field_value',
    ]);
    return result as unknown as RecentValue;
  } catch (error: any) {
    console.error('[RecentValuesService] Error saving recent value:', error);
    if (error.message?.includes('23503') || error.code === '23503') {
      throw new Error('Invalid user ID provided');
    }
    throw new Error(error.message || 'Failed to save recent value');
  }
}

/**
 * Retrieves recent values for a user and field type
 * @param userId - The user ID
 * @param fieldType - The type of field
 * @param limit - Number of recent values to retrieve (default: 5)
 * @returns Array of recent values
 */
export async function getRecentValues(
  userId: string,
  fieldType: string,
  limit: number = 5
): Promise<Partial<RecentValue>[]> {
  const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
  const db = getPostgresInstance();
  await db.ensureInitialized();

  // Validate input
  if (!userId || typeof userId !== 'string') {
    throw new Error('Valid user ID is required');
  }
  if (!fieldType || typeof fieldType !== 'string') {
    throw new Error('Valid field type is required');
  }

  const safeLimit = Math.min(Math.max(parseInt(String(limit)) || 5, 1), 20); // Limit between 1-20

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
  } catch (error: any) {
    console.error(`[RecentValuesService] Error retrieving recent values for ${fieldType}:`, error);
    throw new Error(error.message || 'Failed to retrieve recent values');
  }
}

/**
 * Clears all recent values for a user and field type
 * @param userId - The user ID
 * @param fieldType - The type of field
 * @returns Number of deleted records
 */
export async function clearRecentValues(userId: string, fieldType: string): Promise<number> {
  const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
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
    const result: any = await db.delete('user_recent_values', {
      user_id: userId,
      field_type: fieldType,
    });

    return result?.rowCount || 0;
  } catch (error: any) {
    console.error(`[RecentValuesService] Error clearing recent values for ${fieldType}:`, error);
    throw new Error(error.message || 'Failed to clear recent values');
  }
}

/**
 * Gets all field types that have recent values for a user
 * @param userId - The user ID
 * @returns Array of field types with counts
 */
export async function getFieldTypesWithCounts(userId: string): Promise<FieldTypeWithCount[]> {
  const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
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

    return (result || []) as unknown as FieldTypeWithCount[];
  } catch (error: any) {
    console.error('[RecentValuesService] Error retrieving field types:', error);
    throw new Error(error.message || 'Failed to retrieve field types');
  }
}
