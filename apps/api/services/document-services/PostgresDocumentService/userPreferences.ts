/**
 * User preference operations
 * Handles user document mode settings
 */

import type { UserDocumentMode, UserDocumentModeResult } from './types.js';

/**
 * Get user's document mode preference
 */
export async function getUserDocumentMode(
  postgres: any,
  userId: string
): Promise<UserDocumentMode> {
  try {
    await postgres.ensureInitialized();

    const user = await postgres.queryOne(
      'SELECT document_mode FROM profiles WHERE id = $1',
      [userId],
      { table: 'profiles' }
    );

    return user?.document_mode || 'manual';
  } catch (error) {
    console.error('[PostgresDocumentService] Error getting user document mode:', error);
    throw new Error('Failed to get document mode');
  }
}

/**
 * Set user's document mode preference
 */
export async function setUserDocumentMode(
  postgres: any,
  userId: string,
  mode: UserDocumentMode
): Promise<UserDocumentModeResult> {
  try {
    await postgres.ensureInitialized();

    if (!['manual', 'wolke'].includes(mode)) {
      throw new Error('Invalid document mode. Must be "manual" or "wolke"');
    }

    const result = await postgres.update('profiles', { document_mode: mode }, { id: userId });

    if (result.changes === 0) {
      throw new Error('User not found or mode not updated');
    }

    console.log(`[PostgresDocumentService] User ${userId} document mode set to: ${mode}`);
    return { mode, success: true };
  } catch (error) {
    console.error('[PostgresDocumentService] Error setting user document mode:', error);
    throw error;
  }
}
