/**
 * GrueneratorOffboarding - User deletion and anonymization
 *
 * Handles finding users in Grünerator database and processing their data
 * for GDPR compliance (deletion or anonymization)
 */

import { createLogger } from '../../utils/logger.js';

import type {
  OffboardingUser,
  UserProfile,
  ProcessUserResult,
  AnonymizationData,
} from './types.js';

const log = createLogger('GrueneratorOffboarding');

export class GrueneratorOffboarding {
  private profileService: any;
  private db: any;

  constructor() {
    this.profileService = null;
    this.db = null;
  }

  /**
   * Get PostgreSQL database instance (lazy loading)
   */
  private async getDb(): Promise<any> {
    if (this.db) return this.db;
    const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
    this.db = getPostgresInstance();
    return this.db;
  }

  /**
   * Initialize profile service (lazy loading)
   */
  async init(): Promise<void> {
    if (!this.profileService) {
      const { getProfileService } = await import('../user/ProfileService.js');
      this.profileService = getProfileService();
    }
  }

  /**
   * Find user in Grünerator database by various identifiers
   * @param user - User object with identifiers to search
   * @returns User profile if found, null otherwise
   */
  async findUserInGruenerator(user: OffboardingUser): Promise<UserProfile | null> {
    await this.init();

    try {
      // Try to find user by email first (most common case)
      if (user.email) {
        const profile = await this.profileService.getProfileByEmail(user.email);
        if (profile) return profile;
      }

      // Try to find by keycloak_id (mapped from sherpa_id)
      if (user.sherpa_id) {
        const profile = await this.profileService.getProfileByKeycloakId(user.sherpa_id);
        if (profile) return profile;
      }

      // Try other identifiers using PostgreSQL database
      const db = await this.getDb();
      await db.ensureInitialized();

      const queries = [
        { column: 'username', value: user.username },
        { column: 'sherpa_id', value: user.sherpa_id }, // If sherpa_id is a separate field
      ].filter((q) => q.value);

      for (const query of queries) {
        const result = await (
          await this.getDb()
        ).queryOne(`SELECT * FROM profiles WHERE ${query.column} = $1`, [query.value]);
        if (result) return result as UserProfile;
      }

      return null;
    } catch (error: any) {
      log.error(`Error finding user in Grünerator:`, error.message);
      throw error;
    }
  }

  /**
   * Delete user from Grünerator database
   * @param userId - User ID to delete
   * @returns True if successful
   */
  async deleteUser(userId: string): Promise<boolean> {
    await this.init();
    const db = await this.getDb();
    await db.ensureInitialized();

    try {
      // Delete user data from all relevant tables
      // Delete from related tables first (foreign key constraints)
      await db.delete('group_memberships', { user_id: userId });
      await db.delete('user_sharepics', { user_id: userId });
      await db.delete('user_uploads', { user_id: userId });
      await db.delete('documents', { user_id: userId });

      // Delete from profiles table (this will be handled by ProfileService)
      await this.profileService.deleteProfile(userId);

      log.info(`Successfully deleted user ${userId} from database`);

      return true;
    } catch (error: any) {
      log.error(`Error deleting user ${userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Anonymize user in Grünerator database
   * @param userId - User ID to anonymize
   * @returns True if successful
   */
  async anonymizeUser(userId: string): Promise<boolean> {
    await this.init();
    try {
      // Anonymize user data in profiles table
      const anonymizationData: AnonymizationData = {
        email: `anonymized_${userId}@example.com`,
        username: `anonymized_${userId}`,
        display_name: 'Anonymized User',
        keycloak_id: null,
        sherpa_id: null,
        first_name: null,
        last_name: null,
        avatar_url: null,
        anonymized_at: new Date().toISOString(),
      };

      await this.profileService.updateProfile(userId, anonymizationData);

      log.info(`Successfully anonymized user ${userId} in database`);

      return true;
    } catch (error: any) {
      log.error(`Error anonymizing user ${userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Process individual user for offboarding
   * @param user - User to process
   * @returns Result tuple with status and message
   */
  async processUser(user: OffboardingUser): Promise<ProcessUserResult> {
    try {
      const grueneratorUser = await this.findUserInGruenerator(user);

      if (!grueneratorUser) {
        return {
          status: 'not_found',
          message: 'User not found in Grünerator database',
        };
      }

      // Try to delete user first
      try {
        await this.deleteUser(grueneratorUser.id);
        return {
          status: 'deleted',
          message: `Successfully deleted user ${grueneratorUser.id}`,
        };
      } catch (deleteError: any) {
        log.warn(
          `Could not delete user ${grueneratorUser.id}, attempting anonymization:`,
          deleteError.message
        );

        // If deletion fails, try anonymization
        try {
          await this.anonymizeUser(grueneratorUser.id);
          return {
            status: 'anonymized',
            message: `Successfully anonymized user ${grueneratorUser.id}`,
          };
        } catch (anonymizeError: any) {
          log.error(`Failed to anonymize user ${grueneratorUser.id}:`, anonymizeError.message);
          return {
            status: 'failed',
            message: `Failed to delete or anonymize user: ${anonymizeError.message}`,
          };
        }
      }
    } catch (error: any) {
      log.error(`Error processing user ${user.username}:`, error.message);
      return {
        status: 'failed',
        message: `Processing error: ${error.message}`,
      };
    }
  }
}
