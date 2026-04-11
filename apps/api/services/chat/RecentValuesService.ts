/**
 * Service for managing user's recent form values
 * Provides functionality to save, retrieve, and manage recent form field inputs
 */

import { eq, and, desc, sql } from 'drizzle-orm';

import { userRecentValues } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';

import type { RecentValue, FieldTypeWithCount } from './types.js';

type DrizzleRecentValueRow = typeof userRecentValues.$inferSelect;

/**
 * Map Drizzle result (camelCase fields) to RecentValue (snake_case fields)
 */
function toRecentValue(row: DrizzleRecentValueRow): RecentValue {
  return {
    id: row.id,
    user_id: row.userId || null,
    field_type: row.fieldType,
    field_value: row.fieldValue,
    form_name: row.formName || null,
    created_at: row.createdAt,
  };
}

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
  const db = getDrizzleInstance();

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

  try {
    const result = await db
      .insert(userRecentValues)
      .values({
        userId,
        fieldType,
        fieldValue: trimmedValue,
        formName,
      })
      .onConflictDoUpdate({
        target: [userRecentValues.userId, userRecentValues.fieldType, userRecentValues.fieldValue],
        set: {
          formName,
          createdAt: new Date(),
        },
      })
      .returning();

    return toRecentValue(result[0]);
  } catch (error: unknown) {
    console.error('[RecentValuesService] Error saving recent value:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    const errCode =
      error instanceof Error && 'code' in error ? (error as { code: string }).code : '';
    if (errMsg.includes('23503') || errCode === '23503') {
      throw new Error('Invalid user ID provided');
    }
    throw new Error(errMsg || 'Failed to save recent value');
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
  const db = getDrizzleInstance();

  // Validate input
  if (!userId || typeof userId !== 'string') {
    throw new Error('Valid user ID is required');
  }
  if (!fieldType || typeof fieldType !== 'string') {
    throw new Error('Valid field type is required');
  }

  const safeLimit = Math.min(Math.max(parseInt(String(limit)) || 5, 1), 20); // Limit between 1-20

  try {
    const result = await db
      .select({
        fieldValue: userRecentValues.fieldValue,
        formName: userRecentValues.formName,
        createdAt: userRecentValues.createdAt,
      })
      .from(userRecentValues)
      .where(and(eq(userRecentValues.userId, userId), eq(userRecentValues.fieldType, fieldType)))
      .orderBy(desc(userRecentValues.createdAt))
      .limit(safeLimit);

    return (result || []).map((row) => ({
      id: '',
      user_id: null,
      field_type: '',
      field_value: row.fieldValue,
      form_name: row.formName || null,
      created_at: row.createdAt,
    })) as Partial<RecentValue>[];
  } catch (error: unknown) {
    console.error(`[RecentValuesService] Error retrieving recent values for ${fieldType}:`, error);
    throw new Error(
      (error instanceof Error ? error.message : String(error)) || 'Failed to retrieve recent values'
    );
  }
}

/**
 * Clears all recent values for a user and field type
 * @param userId - The user ID
 * @param fieldType - The type of field
 * @returns Number of deleted records
 */
export async function clearRecentValues(userId: string, fieldType: string): Promise<number> {
  const db = getDrizzleInstance();

  // Validate input
  if (!userId || typeof userId !== 'string') {
    throw new Error('Valid user ID is required');
  }
  if (!fieldType || typeof fieldType !== 'string') {
    throw new Error('Valid field type is required');
  }

  try {
    const result = await db
      .delete(userRecentValues)
      .where(and(eq(userRecentValues.userId, userId), eq(userRecentValues.fieldType, fieldType)));

    return result.rowCount || 0;
  } catch (error: unknown) {
    console.error(`[RecentValuesService] Error clearing recent values for ${fieldType}:`, error);
    throw new Error(
      (error instanceof Error ? error.message : String(error)) || 'Failed to clear recent values'
    );
  }
}

/**
 * Gets all field types that have recent values for a user
 * @param userId - The user ID
 * @returns Array of field types with counts
 */
export async function getFieldTypesWithCounts(userId: string): Promise<FieldTypeWithCount[]> {
  const db = getDrizzleInstance();

  // Validate input
  if (!userId || typeof userId !== 'string') {
    throw new Error('Valid user ID is required');
  }

  try {
    const result = await db
      .select({
        fieldType: userRecentValues.fieldType,
        valueCount: sql<number>`COUNT(*)`,
        lastUsed: sql<Date>`MAX(${userRecentValues.createdAt})`,
      })
      .from(userRecentValues)
      .where(eq(userRecentValues.userId, userId))
      .groupBy(userRecentValues.fieldType)
      .orderBy((t) => desc(t.lastUsed));

    return result.map((row) => ({
      field_type: row.fieldType,
      value_count: row.valueCount,
      last_used: row.lastUsed,
    })) as FieldTypeWithCount[];
  } catch (error: unknown) {
    console.error('[RecentValuesService] Error retrieving field types:', error);
    throw new Error(
      (error instanceof Error ? error.message : String(error)) || 'Failed to retrieve field types'
    );
  }
}
