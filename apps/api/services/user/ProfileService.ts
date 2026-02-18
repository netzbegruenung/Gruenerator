import { getPostgresInstance } from '../../database/services/PostgresService.js';

import type {
  UserProfile,
  ProfileCreateData,
  ProfileUpdateData,
  BetaFeatures,
  ProfileStats,
  HealthCheckResult,
} from './types.js';

interface PostgresService {
  init(): Promise<void>;
  ensureInitialized(): Promise<void>;
  query(sql: string, params?: any[], options?: any): Promise<any[]>;
  queryOne(sql: string, params?: any[], options?: any): Promise<any | null>;
  insert(table: string, data: any): Promise<any>;
  update(table: string, data: any, where: any): Promise<{ data: any[] }>;
  upsert(table: string, data: any, conflictKey: string[]): Promise<any>;
  delete(table: string, where: any): Promise<any[]>;
}

/**
 * ProfileService - Centralized service for user profile operations
 * Handles profile CRUD operations with PostgreSQL
 */
class ProfileService {
  private db: PostgresService;
  private readonly tableName: string = 'profiles';

  constructor() {
    this.db = getPostgresInstance() as unknown as PostgresService;
  }

  /**
   * Initialize the service
   */
  async init(): Promise<void> {
    await this.db.init();
  }

  /**
   * Get user profile by ID
   */
  async getProfileById(userId: string): Promise<UserProfile | null> {
    try {
      await this.db.ensureInitialized();
      const profile = await this.db.queryOne('SELECT * FROM profiles WHERE id = $1', [userId], {
        table: this.tableName,
      });
      return profile as UserProfile | null;
    } catch (error: any) {
      console.error('[ProfileService] Error getting profile by ID:', error);
      throw error;
    }
  }

  /**
   * Get user profile by Keycloak ID
   */
  async getProfileByKeycloakId(keycloakId: string): Promise<UserProfile | null> {
    try {
      await this.db.ensureInitialized();
      const profile = await this.db.queryOne(
        'SELECT * FROM profiles WHERE keycloak_id = $1',
        [keycloakId],
        { table: this.tableName }
      );
      return profile as UserProfile | null;
    } catch (error: any) {
      console.error('[ProfileService] Error getting profile by Keycloak ID:', error);
      throw error;
    }
  }

  /**
   * Get user profile by email
   */
  async getProfileByEmail(email: string): Promise<UserProfile | null> {
    try {
      await this.db.ensureInitialized();
      const profile = await this.db.queryOne('SELECT * FROM profiles WHERE email = $1', [email], {
        table: this.tableName,
      });
      return profile as UserProfile | null;
    } catch (error: any) {
      console.error('[ProfileService] Error getting profile by email:', error);
      throw error;
    }
  }



  /**
   * Create a new user profile
   */
  async createProfile(profileData: ProfileCreateData): Promise<UserProfile> {
    try {
      const newProfile = {
        ...profileData,
        beta_features: profileData.beta_features || {},
        igel_modus: profileData.igel_modus || false,
        groups_enabled: profileData.groups_enabled || false,
        custom_generators: profileData.custom_generators || false,
        database_access: profileData.database_access || false,
        collab: profileData.collab || false,
        notebook: profileData.notebook || false,
        sharepic: profileData.sharepic || false,
        anweisungen: profileData.anweisungen || false,
        avatar_robot_id: profileData.avatar_robot_id || 1,
        interactive_antrag_enabled: profileData.interactive_antrag_enabled ?? true,
      };

      await this.db.ensureInitialized();
      const result = await this.db.insert(this.tableName, newProfile);
      return result as UserProfile;
    } catch (error: any) {
      console.error('[ProfileService] Error creating profile:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, updateData: ProfileUpdateData): Promise<UserProfile> {
    try {
      const dataToUpdate = {
        ...updateData,
      };

      await this.db.ensureInitialized();
      const result = await this.db.update(this.tableName, dataToUpdate, { id: userId });
      return result.data[0] as UserProfile;
    } catch (error: any) {
      console.error('[ProfileService] Error updating profile:', error);
      throw error;
    }
  }

  /**
   * Upsert user profile (create or update)
   */
  async upsertProfile(profileData: ProfileCreateData | ProfileUpdateData): Promise<UserProfile> {
    try {
      const dataToUpsert = {
        ...profileData,
      };

      await this.db.ensureInitialized();
      const result = await this.db.upsert(this.tableName, dataToUpsert, ['id']);
      return result as UserProfile;
    } catch (error: any) {
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
        igel_modus: 'igel_modus',
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
        autoSaveOnExport: 'auto_save_on_export',
        vorlagen: 'vorlagen',
        videoEditor: 'video_editor',
        prompts: 'prompts',
        scanner: 'scanner',
        docs: 'docs',
      };

      if (featureColumnMap[feature]) {
        updateData[featureColumnMap[feature]] = Boolean(enabled);
      }

      const result = await this.updateProfile(userId, updateData);
      console.log(
        `[ProfileService] Beta feature updated: ${feature} = ${enabled} for user ${userId}`
      );
      return result;
    } catch (error: any) {
      console.error('[ProfileService] Error updating beta features:', error);
      throw error;
    }
  }

  /**
   * Update avatar for a user
   */
  async updateAvatar(userId: string, avatarRobotId: number): Promise<UserProfile> {
    try {
      if (!avatarRobotId || avatarRobotId < 1 || avatarRobotId > 9) {
        throw new Error('Avatar Robot ID must be between 1 and 9');
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
    } catch (error: any) {
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
    } catch (error: any) {
      console.error('[ProfileService] Error updating chat color:', error);
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
    value: any
  ): Promise<UserProfile> {
    try {
      if (!generator || !key) {
        throw new Error('Generator and key are required');
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

      const result = await this.updateProfile(userId, { user_defaults: defaults });
      console.log(
        `[ProfileService] User default updated: ${generator}.${key} = ${value} for user ${userId}`
      );
      return result;
    } catch (error: any) {
      console.error('[ProfileService] Error updating user default:', error);
      throw error;
    }
  }

  /**
   * Get user defaults from profile
   */
  getUserDefaults(profile: UserProfile | null): Record<string, Record<string, any>> {
    return profile?.user_defaults || {};
  }

  /**
   * Get a specific user default value
   */
  getUserDefault(
    profile: UserProfile | null,
    generator: string,
    key: string,
    defaultValue: any = null
  ): any {
    return profile?.user_defaults?.[generator]?.[key] ?? defaultValue;
  }

  /**
   * Delete user profile
   */
  async deleteProfile(userId: string): Promise<any[]> {
    try {
      console.log(`[ProfileService] Starting profile deletion for user ${userId}`);
      await this.db.ensureInitialized();

      const userInfo = await this.db.queryOne(
        'SELECT email, username FROM profiles WHERE id = $1',
        [userId],
        { table: this.tableName }
      );
      if (userInfo) {
        console.log(
          `[ProfileService] Deleting user profile: ${userInfo.email || 'N/A'} (${userInfo.username || 'N/A'})`
        );
      } else {
        console.warn(`[ProfileService] User ${userId} not found in profiles table`);
      }

      console.log(`[ProfileService] Executing DELETE from ${this.tableName} WHERE id = ${userId}`);
      const result = await this.db.delete(this.tableName, { id: userId });

      if (result && result.length > 0) {
        console.log(
          `[ProfileService] ✅ Successfully deleted user profile ${userId}. Deleted rows:`,
          result.length
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
    } catch (error: any) {
      console.error(`[ProfileService] ❌ Error deleting profile for user ${userId}:`, error);
      console.error(`[ProfileService] Error details:`, {
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get all profiles (admin function)
   */
  async getAllProfiles(limit: number = 100, offset: number = 0): Promise<UserProfile[]> {
    try {
      await this.db.ensureInitialized();
      const profiles = await this.db.query(
        'SELECT * FROM profiles ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset],
        { table: this.tableName }
      );
      return profiles as UserProfile[];
    } catch (error: any) {
      console.error('[ProfileService] Error getting all profiles:', error);
      throw error;
    }
  }

  /**
   * Get profile statistics
   */
  async getProfileStats(): Promise<ProfileStats> {
    try {
      await this.db.ensureInitialized();
      const stats = await this.db.queryOne(`
        SELECT
          COUNT(*) as total_profiles,
          COUNT(*) FILTER (WHERE igel_modus = true) as igel_users,
          COUNT(*) FILTER (WHERE bundestag_api_enabled = true) as bundestag_users,
          COUNT(*) FILTER (WHERE memory_enabled = true) as memory_users,
          COUNT(*) FILTER (WHERE last_login > NOW() - INTERVAL '30 days') as active_users
        FROM profiles
      `);
      return stats as ProfileStats;
    } catch (error: any) {
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
      igel_modus: profile.igel_modus || false,
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
      autoSaveOnExport: profile.auto_save_on_export || false,
      vorlagen: profile.vorlagen || false,
      videoEditor: profile.video_editor || false,
      prompts: profile.prompts || false,
      scanner: profile.scanner || false,
      docs: profile.docs || false,
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
    sessionUser: any,
    profile: UserProfile,
    feature: string | null = null,
    enabled: boolean | null = null
  ): void {
    sessionUser.beta_features = this.getMergedBetaFeatures(profile);

    const featureMap: Record<string, string> = {
      igel_modus: 'igel_modus',
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
      autoSaveOnExport: 'auto_save_on_export',
      vorlagen: 'vorlagen',
      videoEditor: 'video_editor',
      prompts: 'prompts',
      scanner: 'scanner',
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
      await this.db.ensureInitialized();
      const result = await this.db.query('SELECT COUNT(*) as count FROM profiles LIMIT 1');
      return {
        status: 'healthy',
        database: 'postgresql',
        profileCount: result[0]?.count || 0,
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        database: 'postgresql',
        error: error.message,
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
