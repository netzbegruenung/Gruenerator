/**
 * User preference operations
 * Handles user document mode settings
 */

import { createLogger } from '../../../utils/logger.js';

import type { UserDocumentMode, UserDocumentModeResult } from './types.js';
import type { PostgresService } from '../../../database/services/PostgresService/PostgresService.js';

const log = createLogger('userPreferences');

/**
 * Get user's document mode preference
 */
export async function getUserDocumentMode(
  postgres: PostgresService,
  userId: string
): Promise<UserDocumentMode> {
  try {
    await postgres.ensureInitialized();

    const user = await postgres.queryOne<{ document_mode: string | null }>(
      'SELECT document_mode FROM profiles WHERE id = $1',
      [userId],
      { table: 'profiles' }
    );

    return (user?.document_mode as UserDocumentMode) || 'manual';
  } catch (error) {
    log.error('[PostgresDocumentService] Error getting user document mode:', { error });
    throw new Error('Failed to get document mode');
  }
}

/**
 * Set user's document mode preference
 */
export async function setUserDocumentMode(
  postgres: PostgresService,
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

    log.debug(`[PostgresDocumentService] User ${userId} document mode set to: ${mode}`);
    return { mode, success: true };
  } catch (error) {
    log.error('[PostgresDocumentService] Error setting user document mode:', { error });
    throw error;
  }
}
