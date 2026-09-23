import { type ChatBackground } from '@gruenerator/contracts';
import { ROBOT_ID_MIN, ROBOT_ID_MAX } from '@gruenerator/core/avatar';
import { eq, sql } from 'drizzle-orm';

import { profiles } from '../../database/schema/core.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { type DeleteResult, getPostgresInstance } from '../../database/services/PostgresService.js';
import { toUserFacingMessage } from '../../utils/errors/index.js';
import { deriveLandesverbandFromRoles } from '../landesverband/LandesverbandDerivationService.js';

import { toUserProfile } from './profileMapper.js';

import type {
  UserProfile,
  ProfileCreateData,
  ProfileUpdateData,
  BetaFeatures,
  ProfileStats,
  HealthCheckResult,
} from './types.js';

// Wolki is a specific unlock-gated avatar (requires an active Wolke
// connection), not part of the avatar count — keep it as its own constant so
// raising ROBOT_ID_MAX never accidentally moves the "special" avatar.
const WOLKI_ROBOT_ID = 10;

/**
 * ProfileService - Centralized service for user profile operations
 * Handles profile CRUD operations with PostgreSQL via Drizzle ORM
 */
class ProfileService {
  /**
   * Initialize the service
   */
  async init(): Promise<void> {
    await getPostgresInstance().init();
  }

  /**
   * Get user profile by ID
   */
  async getProfileById(userId: string): Promise<UserProfile | null> {
    try {
      const db = getDrizzleInstance();
      const rows = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
      const row = rows[0];
      return row ? toUserProfile(row) : null;
    } catch (error: unknown) {
      console.error('[ProfileService] Error getting profile by ID:', error);
      throw error;
    }
  }

  /**
   * Get user profile by Keycloak ID
   */
  async getProfileByKeycloakId(keycloakId: string): Promise<UserProfile | null> {
    try {
      const db = getDrizzleInstance();
      const rows = await db
        .select()
        .from(profiles)
        .where(eq(profiles.keycloak_id, keycloakId))
        .limit(1);
      const row = rows[0];
      return row ? toUserProfile(row) : null;
    } catch (error: unknown) {
      console.error('[ProfileService] Error getting profile by Keycloak ID:', error);
      throw error;
    }
  }

  /**
   * Get user profile by email
   */
  async getProfileByEmail(email: string): Promise<UserProfile | null> {
    try {
      const db = getDrizzleInstance();
      const rows = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1);
      const row = rows[0];
      return row ? toUserProfile(row) : null;
    } catch (error: unknown) {
      console.error('[ProfileService] Error getting profile by email:', error);
      throw error;
    }
  }

  /**
   * Create a new user profile
   */
  async createProfile(profileData: ProfileCreateData): Promise<UserProfile> {
    try {
      const db = getDrizzleInstance();

      const insertValues: typeof profiles.$inferInsert = {
        ...(profileData.id ? { id: profileData.id } : {}),
        keycloak_id: profileData.keycloak_id,
        email: profileData.email,
        username: profileData.username,
        display_name: profileData.display_name,
        avatar_robot_id: profileData.avatar_robot_id ?? 1,
        chat_color: profileData.chat_color,
        beta_features: profileData.beta_features ?? {},
        user_defaults: profileData.user_defaults ?? {},
        // Kein 'de-DE'-Ersatz: ein Profil ohne bekanntes Land bleibt leer, und
        // die Oberfläche fragt einmalig nach. Geschrieben wird es sonst nur von
        // `config/localeSync.ts` (IdP) und `PUT /auth/locale` (eigene Wahl).
        ...(profileData.locale != null && { locale: profileData.locale }),
        last_login: profileData.last_login ? new Date(profileData.last_login) : null,
        groups_enabled: profileData.groups_enabled ?? false,
        custom_generators: profileData.custom_generators ?? false,
        database_access: profileData.database_access ?? false,
        collab: profileData.collab ?? false,
        notebook: profileData.notebook ?? false,
        sharepic: profileData.sharepic ?? false,
        anweisungen: profileData.anweisungen ?? false,
        interactive_antrag_enabled: profileData.interactive_antrag_enabled ?? true,
      };

      const rows = await db.insert(profiles).values(insertValues).returning();
      return toUserProfile(rows[0]);
    } catch (error: unknown) {
      console.error('[ProfileService] Error creating profile:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, updateData: ProfileUpdateData): Promise<UserProfile> {
    try {
      const db = getDrizzleInstance();

      // Build a type-safe update object from the ProfileUpdateData
      // ProfileUpdateData uses snake_case column names matching the schema
      const setValues: Partial<typeof profiles.$inferInsert> = {};

      if (updateData.email !== undefined) setValues.email = updateData.email;
      if (updateData.username !== undefined) setValues.username = updateData.username;
      if (updateData.display_name !== undefined) setValues.display_name = updateData.display_name;
      if (updateData.avatar_robot_id !== undefined)
        setValues.avatar_robot_id = updateData.avatar_robot_id;
      if (updateData.chat_color !== undefined) setValues.chat_color = updateData.chat_color;
      if (updateData.beta_features !== undefined)
        setValues.beta_features = updateData.beta_features;
      if (updateData.user_defaults !== undefined)
        setValues.user_defaults = updateData.user_defaults;

      // Handle the dynamic keys from ProfileUpdateData's index signature
      // These correspond to feature flag columns (boolean) and other columns
      const knownBooleanColumns = [
        'groups_enabled',
        'custom_generators',
        'database_access',
        'collab',
        'notebook',
        'sharepic',
        'anweisungen',
        'labor_enabled',
        'sites_enabled',
        'chat',
        'interactive_antrag_enabled',
        'vorlagen',
        'video_editor',
        'scanner',
        'prompts',
        'docs',
        'boards',
        'bundestag_api_enabled',
        'memory_enabled',
        'reduce_motion',
        'reduce_transparency',
        'show_skip_link',
        'deutschlandmodus',
        // SECURITY: `is_admin` intentionally excluded — the admin flag must never be
        // writable through the general profile-update path. Keeping it out of the
        // writable column list makes self-promotion impossible even if a future
        // caller forwards an unfiltered request body into updateProfile.
        'content_management',
        'sites',
        'website',
        'ai_sharepic',
        'groups',
      ] as const;

      for (const col of knownBooleanColumns) {
        if (updateData[col] !== undefined) {
          (setValues as Record<string, unknown>)[col] = Boolean(updateData[col]);
        }
      }

      const knownTextColumns = [
        'locale',
        'locale_source',
        'chat_background',
        'custom_prompt',
        'presseabbinder',
        'custom_antrag_gliederung',
        'auth_source',
        'document_mode',
        'default_startpage',
        'feedback_button',
        'tts_voice_id',
      ] as const;

      for (const col of knownTextColumns) {
        if (updateData[col] !== undefined) {
          (setValues as Record<string, unknown>)[col] = updateData[col];
        }
      }

      // Einzige Zeitstempel-Spalte, die über diesen Weg geschrieben wird
      // (Art.-9-Einwilligung). Sie braucht ein eigenes Feld, weil Drizzle hier
      // ein `Date` erwartet, die Aufrufer aber ISO-Strings durchreichen — als
      // String landete sie stumm in keiner der beiden Listen oben.
      if (updateData.ai_consent_at !== undefined) {
        const raw = updateData.ai_consent_at;
        setValues.ai_consent_at = raw ? new Date(raw as string) : null;
      }

      const rows = await db
        .update(profiles)
        .set(setValues)
        .where(eq(profiles.id, userId))
        .returning();

      if (!rows[0]) {
        throw new Error(`Profile not found for userId: ${userId}`);
      }

      return toUserProfile(rows[0]);
    } catch (error: unknown) {
      console.error('[ProfileService] Error updating profile:', error);
      throw error;
    }
  }

  /**
   * Upsert user profile (create or update)
   */
  async upsertProfile(profileData: ProfileCreateData | ProfileUpdateData): Promise<UserProfile> {
    try {
      const db = getDrizzleInstance();

      const data = profileData as ProfileCreateData;
      const insertValues: typeof profiles.$inferInsert = {
        ...(data.id ? { id: data.id } : {}),
        keycloak_id: data.keycloak_id,
        email: data.email,
        username: data.username,
        display_name: data.display_name,
        avatar_robot_id: data.avatar_robot_id ?? 1,
        chat_color: data.chat_color,
        beta_features: data.beta_features ?? {},
        user_defaults: data.user_defaults ?? {},
        ...(data.locale != null && { locale: data.locale }),
        last_login: data.last_login ? new Date(data.last_login) : null,
        groups_enabled: data.groups_enabled ?? false,
        custom_generators: data.custom_generators ?? false,
        database_access: data.database_access ?? false,
        collab: data.collab ?? false,
        notebook: data.notebook ?? false,
        sharepic: data.sharepic ?? false,
        anweisungen: data.anweisungen ?? false,
        interactive_antrag_enabled: data.interactive_antrag_enabled ?? true,
      };

      const rows = await db
        .insert(profiles)
        .values(insertValues)
        .onConflictDoUpdate({
          target: profiles.id,
          set: {
            keycloak_id: sql`EXCLUDED.keycloak_id`,
            email: sql`EXCLUDED.email`,
            username: sql`EXCLUDED.username`,
            display_name: sql`EXCLUDED.display_name`,
            avatar_robot_id: sql`EXCLUDED.avatar_robot_id`,
            chat_color: sql`EXCLUDED.chat_color`,
            beta_features: sql`EXCLUDED.beta_features`,
            user_defaults: sql`EXCLUDED.user_defaults`,
            // COALESCE, nicht EXCLUDED: seit `locale` leer sein darf, würde ein
            // Upsert ohne Land ein bereits bekanntes überschreiben — ein Login
            // über einen länderneutralen IdP löschte sonst die Wahl der Person.
            locale: sql`COALESCE(EXCLUDED.locale, ${profiles.locale})`,
            last_login: sql`EXCLUDED.last_login`,
            groups_enabled: sql`EXCLUDED.groups_enabled`,
            custom_generators: sql`EXCLUDED.custom_generators`,
            database_access: sql`EXCLUDED.database_access`,
            collab: sql`EXCLUDED.collab`,
            notebook: sql`EXCLUDED.notebook`,
            sharepic: sql`EXCLUDED.sharepic`,
            anweisungen: sql`EXCLUDED.anweisungen`,
            interactive_antrag_enabled: sql`EXCLUDED.interactive_antrag_enabled`,
            updated_at: sql`NOW()`,
          },
        })
        .returning();

      return toUserProfile(rows[0]);
    } catch (error: unknown) {
      console.error('[ProfileService] Error upserting profile:', error);
      throw error;
    }
  }

  /**
   * Update beta features for a user
   */
  async updateBetaFeatures(
    userId: string,
    feature: string,
    enabled: boolean
  ): Promise<UserProfile> {
    try {
      const currentProfile = await this.getProfileById(userId);
      if (!currentProfile) {
        throw new Error('Profile not found');
      }

      const currentBetaFeatures = currentProfile.beta_features || {};
      const updatedBetaFeatures = {
        ...currentBetaFeatures,
        [feature]: enabled,
      };

      const updateData: ProfileUpdateData = {
        beta_features: updatedBetaFeatures,
      };

      const featureColumnMap: Record<string, string> = {
        customGenerators: 'custom_generators',
        database: 'database_access',
        collab: 'collab',
        notebook: 'notebook',
        sharepic: 'sharepic',
        anweisungen: 'anweisungen',
        labor: 'labor_enabled',
        sites: 'sites_enabled',
        chat: 'chat',
        interactiveAntrag: 'interactive_antrag_enabled',
        vorlagen: 'vorlagen',
        videoEditor: 'video_editor',
        prompts: 'prompts',
        memories: 'memory_enabled',
      };

      if (featureColumnMap[feature]) {
        updateData[featureColumnMap[feature]] = Boolean(enabled);
      }

      const result = await this.updateProfile(userId, updateData);
      console.log(
        `[ProfileService] Beta feature updated: ${feature} = ${enabled} for user ${userId}`
      );
      return result;
    } catch (error: unknown) {
      console.error('[ProfileService] Error updating beta features:', error);
      throw error;
    }
  }

  /**
   * Update avatar for a user
   */
  async updateAvatar(userId: string, avatarRobotId: number): Promise<UserProfile> {
    try {
      if (!avatarRobotId || avatarRobotId < ROBOT_ID_MIN || avatarRobotId > ROBOT_ID_MAX) {
        throw new Error(`Avatar Robot ID must be between ${ROBOT_ID_MIN} and ${ROBOT_ID_MAX}`);
      }

      if (avatarRobotId === WOLKI_ROBOT_ID) {
        const { NextcloudShareManager } =
          await import('../../utils/integrations/nextcloud/shareManager.js');
        const shareLinks = await NextcloudShareManager.getShareLinks(userId);
        if (!shareLinks || shareLinks.length === 0) {
          throw new Error(`Avatar ${WOLKI_ROBOT_ID} (Wolki) requires an active Wolke connection`);
        }
      }

      const result = await this.updateProfile(userId, { avatar_robot_id: avatarRobotId });

      const verifiedProfile = await this.getProfileById(userId);
      if (!verifiedProfile || verifiedProfile.avatar_robot_id !== avatarRobotId) {
        console.error(`[ProfileService] 🚨 Avatar update verification FAILED for user ${userId}:`, {
          requested: avatarRobotId,
          actual: verifiedProfile?.avatar_robot_id,
          updateResult: result,
        });
        throw new Error(
          `Avatar update failed - requested ${avatarRobotId} but database shows ${verifiedProfile?.avatar_robot_id}`
        );
      }

      console.log(
        `[ProfileService] 🎨 Avatar updated for user ${userId}: avatar_robot_id=${avatarRobotId} (verified in PostgreSQL)`
      );
      return verifiedProfile;
    } catch (error: unknown) {
      console.error('[ProfileService] Error updating avatar:', error);
      throw error;
    }
  }

  /**
   * Update chat color for a user
   */
  async updateChatColor(userId: string, color: string): Promise<UserProfile> {
    try {
      if (!color || typeof color !== 'string') {
        throw new Error('Color is required and must be a string');
      }

      const result = await this.updateProfile(userId, { chat_color: color });
      console.log(`[ProfileService] Chat color updated for user ${userId}: ${color}`);
      return result;
    } catch (error: unknown) {
      console.error('[ProfileService] Error updating chat color:', error);
      throw error;
    }
  }

  /**
   * Update the chat-start background preset for a user
   */
  async updateChatBackground(userId: string, background: ChatBackground): Promise<UserProfile> {
    try {
      const result = await this.updateProfile(userId, { chat_background: background });
      console.log(`[ProfileService] Chat background updated for user ${userId}: ${background}`);
      return result;
    } catch (error: unknown) {
      console.error('[ProfileService] Error updating chat background:', error);
      throw error;
    }
  }

  /**
   * Update a user default setting for a specific generator
   */
  async updateUserDefault(
    userId: string,
    generator: string,
    key: string,
    value: unknown
  ): Promise<UserProfile> {
    try {
      if (!generator || !key) {
        throw new Error('Generator and key are required');
      }
      const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];
      if (FORBIDDEN_KEYS.includes(generator) || FORBIDDEN_KEYS.includes(key)) {
        throw new Error('Invalid generator or key name');
      }

      const currentProfile = await this.getProfileById(userId);
      if (!currentProfile) {
        throw new Error('Profile not found');
      }

      const defaults = currentProfile.user_defaults || {};
      if (!defaults[generator]) {
        defaults[generator] = {};
      }
      defaults[generator][key] = value;

      const updated = await this.updateProfile(userId, { user_defaults: defaults });
      if (generator === 'profile' && key === 'roles') {
        await deriveLandesverbandFromRoles(userId, value as { bundesland?: string }[]);
      }
      return updated;
    } catch (error: unknown) {
      console.error('[ProfileService] Error updating user default:', error);
      throw error;
    }
  }

  /**
   * Replace an entire generator object within user_defaults in a single write.
   * Use when applying a full preset (e.g. notification level) instead of
   * many per-key updateUserDefault calls.
   */
  async setUserDefaultsGenerator(
    userId: string,
    generator: string,
    value: Record<string, unknown>
  ): Promise<UserProfile> {
    try {
      if (!generator) {
        throw new Error('Generator is required');
      }
      const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];
      if (FORBIDDEN_KEYS.includes(generator)) {
        throw new Error('Invalid generator name');
      }

      const currentProfile = await this.getProfileById(userId);
      if (!currentProfile) {
        throw new Error('Profile not found');
      }

      const defaults = currentProfile.user_defaults || {};
      defaults[generator] = value;

      const updated = await this.updateProfile(userId, { user_defaults: defaults });
      if (generator === 'profile' && Array.isArray((value as Record<string, unknown>).roles)) {
        await deriveLandesverbandFromRoles(
          userId,
          (value as Record<string, unknown>).roles as { bundesland?: string }[]
        );
      }
      return updated;
    } catch (error: unknown) {
      console.error('[ProfileService] Error setting user defaults generator:', error);
      throw error;
    }
  }

  /**
   * Get user defaults from profile
   */
  getUserDefaults(profile: UserProfile | null): Record<string, Record<string, unknown>> {
    return profile?.user_defaults || {};
  }

  /**
   * Get a specific user default value
   */
  getUserDefault(
    profile: UserProfile | null,
    generator: string,
    key: string,
    defaultValue: unknown = null
  ): unknown {
    return profile?.user_defaults?.[generator]?.[key] ?? defaultValue;
  }

  /**
   * Delete user profile
   */
  async deleteProfile(userId: string): Promise<DeleteResult> {
    try {
      console.log(`[ProfileService] Starting profile deletion for user ${userId}`);

      // Look up basic info before deletion for logging purposes
      const db = getDrizzleInstance();
      const userInfoRows = await db
        .select({ email: profiles.email, username: profiles.username })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1);

      const userInfo = userInfoRows[0];
      if (userInfo) {
        console.log(
          `[ProfileService] Deleting user profile: ${userInfo.email ?? 'N/A'} (${userInfo.username ?? 'N/A'})`
        );
      } else {
        console.warn(`[ProfileService] User ${userId} not found in profiles table`);
      }

      console.log(`[ProfileService] Executing DELETE from profiles WHERE id = ${userId}`);

      // Use the legacy PostgresService delete for DeleteResult compatibility
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();
      const result = await postgres.delete('profiles', { id: userId });

      if (result && result.changes > 0) {
        console.log(
          `[ProfileService] ✅ Successfully deleted user profile ${userId}. Deleted rows:`,
          result.changes
        );
        console.log(
          `[ProfileService] CASCADE deletion will now automatically remove related data from tables with ON DELETE CASCADE constraints`
        );
      } else {
        console.warn(
          `[ProfileService] ⚠️ Delete operation returned no rows for user ${userId} - user may not exist`
        );
      }

      return result;
    } catch (error: unknown) {
      console.error(`[ProfileService] ❌ Error deleting profile for user ${userId}:`, error);
      if (error instanceof Error) {
        console.error(`[ProfileService] Error details:`, {
          message: error.message,
          code: 'code' in error ? (error as { code: string }).code : undefined,
          stack: error.stack,
        });
      }
      throw error;
    }
  }

  /**
   * Get all profiles (admin function)
   */
  async getAllProfiles(limit: number = 100, offset: number = 0): Promise<UserProfile[]> {
    try {
      const db = getDrizzleInstance();
      const rows = await db
        .select()
        .from(profiles)
        .orderBy(sql`${profiles.created_at} DESC`)
        .limit(limit)
        .offset(offset);
      return rows.map(toUserProfile);
    } catch (error: unknown) {
      console.error('[ProfileService] Error getting all profiles:', error);
      throw error;
    }
  }

  /**
   * Get profile statistics
   */
  async getProfileStats(): Promise<ProfileStats> {
    try {
      const db = getDrizzleInstance();
      try {
        const result = await db
          .select({
            total_profiles: sql<number>`COUNT(*)`,
            bundestag_users: sql<number>`COUNT(*) FILTER (WHERE ${profiles.bundestag_api_enabled} = true)`,
            memory_users: sql<number>`COUNT(*) FILTER (WHERE ${profiles.memory_enabled} = true)`,
            active_users: sql<number>`COUNT(*) FILTER (WHERE ${profiles.last_login} > NOW() - INTERVAL '30 days')`,
          })
          .from(profiles);
        return result[0];
      } catch (innerError: unknown) {
        // PostgreSQL error 42703 = undefined_column (e.g. bundestag_api_enabled not yet added)
        if (
          innerError instanceof Error &&
          'code' in innerError &&
          (innerError as { code: string }).code === '42703'
        ) {
          console.warn('[ProfileService] Column missing in getProfileStats, using fallback query');
          const result = await db
            .select({
              total_profiles: sql<number>`COUNT(*)`,
              bundestag_users: sql<number>`0`,
              memory_users: sql<number>`0`,
              active_users: sql<number>`COUNT(*) FILTER (WHERE ${profiles.last_login} > NOW() - INTERVAL '30 days')`,
            })
            .from(profiles);
          return result[0];
        }
        throw innerError;
      }
    } catch (error: unknown) {
      console.error('[ProfileService] Error getting profile stats:', error);
      throw error;
    }
  }

  /**
   * Get merged beta features combining JSON field with individual columns
   */
  getMergedBetaFeatures(profile: UserProfile): BetaFeatures {
    const profileBetaFeatures = profile.beta_features || {};
    const profileSettingsAsBetaFeatures: BetaFeatures = {
      groups: profile.groups_enabled || false,
      customGenerators: profile.custom_generators || false,
      database: profile.database_access || false,
      collab: profile.collab || false,
      notebook: profile.notebook || false,
      sharepic: profile.sharepic || false,
      anweisungen: profile.anweisungen || false,
      labor: profile.labor_enabled || false,
      sites: profile.sites_enabled || false,
      chat: profile.chat || false,
      interactiveAntrag: profile.interactive_antrag_enabled ?? true,
      vorlagen: profile.vorlagen || false,
      videoEditor: profile.video_editor || false,
      prompts: profile.prompts || false,
      scanner: profile.scanner || false,
      docs: profile.docs || false,
      boards: profile.boards || false,
      memories: profile.memory_enabled ?? true,
    };

    return {
      ...profileBetaFeatures,
      ...profileSettingsAsBetaFeatures,
    } as BetaFeatures;
  }

  /**
   * Update session user object with profile changes
   */
  updateUserSession(
    sessionUser: { beta_features?: Record<string, boolean>; [key: string]: unknown },
    profile: UserProfile,
    feature: string | null = null,
    enabled: boolean | null = null
  ): void {
    sessionUser.beta_features = this.getMergedBetaFeatures(profile);

    const featureMap: Record<string, string> = {
      groups: 'groups_enabled',
      customGenerators: 'custom_generators',
      database: 'database_access',
      collab: 'collab',
      notebook: 'notebook',
      sharepic: 'sharepic',
      anweisungen: 'anweisungen',
      labor: 'labor_enabled',
      sites: 'sites_enabled',
      chat: 'chat',
      interactiveAntrag: 'interactive_antrag_enabled',
      vorlagen: 'vorlagen',
      videoEditor: 'video_editor',
      prompts: 'prompts',
      scanner: 'scanner',
      memories: 'memory_enabled',
    };

    Object.entries(featureMap).forEach(([key, column]) => {
      sessionUser[column] = Boolean(profile[column as keyof UserProfile]);
      if (key !== column) {
        sessionUser[key] = Boolean(profile[column as keyof UserProfile]);
      }
    });

    if (feature && enabled !== null) {
      const column = featureMap[feature];
      if (column) {
        sessionUser[column] = Boolean(enabled);
        sessionUser[feature] = Boolean(enabled);
      }
    }
  }

  /**
   * Health check for the service
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const db = getDrizzleInstance();
      const result = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(profiles)
        .limit(1);
      return {
        status: 'healthy',
        database: 'postgresql',
        profileCount: result[0]?.count ?? 0,
      };
    } catch (error: unknown) {
      return {
        status: 'unhealthy',
        database: 'postgresql',
        error: toUserFacingMessage(error),
      };
    }
  }
}

// Export singleton instance
let profileServiceInstance: ProfileService | null = null;

export function getProfileService(): ProfileService {
  if (!profileServiceInstance) {
    profileServiceInstance = new ProfileService();
  }
  return profileServiceInstance;
}

export { ProfileService };
export default ProfileService;
