import { getDatabaseAdapter } from '../database/services/DatabaseAdapter.js';

/**
 * ProfileService - Centralized service for user profile operations
 * Handles profile CRUD operations with database abstraction
 * Supports migration from Supabase to PostgreSQL
 */
class ProfileService {
    constructor() {
        this.db = getDatabaseAdapter();
        this.tableName = 'profiles';
    }

    /**
     * Initialize the service
     */
    async init() {
        await this.db.init();
    }

    /**
     * Get user profile by ID
     */
    async getProfileById(userId) {
        try {
            await this.db.ensureInitialized();
            const profile = await this.db.queryOne(
                'SELECT * FROM profiles WHERE id = $1',
                [userId],
                { table: this.tableName }
            );
            if (profile) {
                console.log(`[ProfileService] 📄 Profile fetched for user ${userId}: avatar_robot_id=${profile.avatar_robot_id}`);
            } else {
                console.log(`[ProfileService] ❌ No profile found for user ${userId}`);
            }
            return profile;
        } catch (error) {
            console.error('[ProfileService] Error getting profile by ID:', error);
            throw error;
        }
    }

    /**
     * Get user profile by Keycloak ID
     */
    async getProfileByKeycloakId(keycloakId) {
        try {
            await this.db.ensureInitialized();
            const profile = await this.db.queryOne(
                'SELECT * FROM profiles WHERE keycloak_id = $1',
                [keycloakId],
                { table: this.tableName }
            );
            if (profile) {
                console.log(`[ProfileService] 🔑 Profile fetched by Keycloak ID ${keycloakId}: user_id=${profile.id}, avatar_robot_id=${profile.avatar_robot_id}`);
            } else {
                console.log(`[ProfileService] ❌ No profile found for Keycloak ID ${keycloakId}`);
            }
            return profile;
        } catch (error) {
            console.error('[ProfileService] Error getting profile by Keycloak ID:', error);
            throw error;
        }
    }

    /**
     * Get user profile by email
     */
    async getProfileByEmail(email) {
        try {
            await this.db.ensureInitialized();
            const profile = await this.db.queryOne(
                'SELECT * FROM profiles WHERE email = $1',
                [email],
                { table: this.tableName }
            );
            return profile;
        } catch (error) {
            console.error('[ProfileService] Error getting profile by email:', error);
            throw error;
        }
    }

    /**
     * Create a new user profile
     */
    async createProfile(profileData) {
        try {
            // Don't include updated_at - PostgresService handles timestamps
            const newProfile = {
                ...profileData,
                beta_features: profileData.beta_features || {},
                igel_modus: profileData.igel_modus || false,
                bundestag_api_enabled: profileData.bundestag_api_enabled || false,
                groups: profileData.groups || false,
                custom_generators: profileData.custom_generators || false,
                database_access: profileData.database_access || false,
                you_generator: profileData.you_generator || false,
                collab: profileData.collab || false,
                qa: profileData.qa || false,
                sharepic: profileData.sharepic || false,
                anweisungen: profileData.anweisungen || false,
                memory: profileData.memory || false,
                memory_enabled: profileData.memory_enabled || false,
                avatar_robot_id: profileData.avatar_robot_id || 1
            };

            await this.db.ensureInitialized();
            const result = await this.db.insert(this.tableName, newProfile);
            return result;
        } catch (error) {
            console.error('[ProfileService] Error creating profile:', error);
            throw error;
        }
    }

    /**
     * Update user profile
     */
    async updateProfile(userId, updateData) {
        try {
            // Don't include updated_at - PostgresService adds it automatically
            const dataToUpdate = {
                ...updateData
            };

            await this.db.ensureInitialized();
            const result = await this.db.update(this.tableName, dataToUpdate, { id: userId });
            return result.data[0];
        } catch (error) {
            console.error('[ProfileService] Error updating profile:', error);
            throw error;
        }
    }

    /**
     * Upsert user profile (create or update)
     */
    async upsertProfile(profileData) {
        try {
            // Don't include updated_at - PostgresService adds it automatically
            const dataToUpsert = {
                ...profileData
            };

            await this.db.ensureInitialized();
            const result = await this.db.upsert(this.tableName, dataToUpsert, ['id']);
            return result;
        } catch (error) {
            console.error('[ProfileService] Error upserting profile:', error);
            throw error;
        }
    }

    /**
     * Update beta features for a user
     */
    async updateBetaFeatures(userId, feature, enabled) {
        try {
            // Get current profile
            const currentProfile = await this.getProfileById(userId);
            if (!currentProfile) {
                throw new Error('Profile not found');
            }

            // Update beta features
            const currentBetaFeatures = currentProfile.beta_features || {};
            const updatedBetaFeatures = {
                ...currentBetaFeatures,
                [feature]: enabled
            };

            // Prepare update data - include both beta_features JSON and individual columns
            const updateData = {
                beta_features: updatedBetaFeatures
            };

            // Update individual feature columns as well for backward compatibility
            const featureColumnMap = {
                'igel_modus': 'igel_modus',
                'bundestag_api_enabled': 'bundestag_api_enabled',
                'groups': 'groups_enabled',
                'customGenerators': 'custom_generators',
                'database': 'database_access',
                'you': 'you_generator',
                'collab': 'collab',
                'qa': 'qa',
                'sharepic': 'sharepic',
                'anweisungen': 'anweisungen',
                'memory': 'memory'
            };

            if (featureColumnMap[feature]) {
                updateData[featureColumnMap[feature]] = Boolean(enabled);
            }

            const result = await this.updateProfile(userId, updateData);
            console.log(`[ProfileService] Beta feature updated: ${feature} = ${enabled} for user ${userId}`);
            return result;
        } catch (error) {
            console.error('[ProfileService] Error updating beta features:', error);
            throw error;
        }
    }

    /**
     * Update avatar for a user
     */
    async updateAvatar(userId, avatarRobotId) {
        try {
            if (!avatarRobotId || avatarRobotId < 1 || avatarRobotId > 9) {
                throw new Error('Avatar Robot ID must be between 1 and 9');
            }

            const result = await this.updateProfile(userId, { avatar_robot_id: avatarRobotId });
            
            // Verify the update actually worked by immediately reading back
            const verifiedProfile = await this.getProfileById(userId);
            if (!verifiedProfile || verifiedProfile.avatar_robot_id !== avatarRobotId) {
                console.error(`[ProfileService] 🚨 Avatar update verification FAILED for user ${userId}:`, {
                    requested: avatarRobotId,
                    actual: verifiedProfile?.avatar_robot_id,
                    updateResult: result
                });
                throw new Error(`Avatar update failed - requested ${avatarRobotId} but database shows ${verifiedProfile?.avatar_robot_id}`);
            }
            
            console.log(`[ProfileService] 🎨 Avatar updated for user ${userId}: avatar_robot_id=${avatarRobotId} (verified in PostgreSQL)`);
            return verifiedProfile;
        } catch (error) {
            console.error('[ProfileService] Error updating avatar:', error);
            throw error;
        }
    }

    /**
     * Update chat color for a user
     */
    async updateChatColor(userId, color) {
        try {
            if (!color || typeof color !== 'string') {
                throw new Error('Color is required and must be a string');
            }

            const result = await this.updateProfile(userId, { chat_color: color });
            console.log(`[ProfileService] Chat color updated for user ${userId}: ${color}`);
            return result;
        } catch (error) {
            console.error('[ProfileService] Error updating chat color:', error);
            throw error;
        }
    }

    /**
     * Update memory settings for a user
     */
    async updateMemorySettings(userId, memoryEnabled) {
        try {
            if (typeof memoryEnabled !== 'boolean') {
                throw new Error('Memory enabled must be a boolean');
            }

            const result = await this.updateProfile(userId, { memory_enabled: memoryEnabled });
            console.log(`[ProfileService] Memory settings updated for user ${userId}: ${memoryEnabled}`);
            return result;
        } catch (error) {
            console.error('[ProfileService] Error updating memory settings:', error);
            throw error;
        }
    }

    /**
     * Delete user profile
     */
    async deleteProfile(userId) {
        try {
            await this.db.ensureInitialized();
            const result = await this.db.delete(this.tableName, { id: userId });
            return result;
        } catch (error) {
            console.error('[ProfileService] Error deleting profile:', error);
            throw error;
        }
    }

    /**
     * Get all profiles (admin function)
     */
    async getAllProfiles(limit = 100, offset = 0) {
        try {
            await this.db.ensureInitialized();
            const profiles = await this.db.query(
                'SELECT * FROM profiles ORDER BY created_at DESC LIMIT $1 OFFSET $2',
                [limit, offset],
                { table: this.tableName }
            );
            return profiles;
        } catch (error) {
            console.error('[ProfileService] Error getting all profiles:', error);
            throw error;
        }
    }

    /**
     * Get profile statistics
     */
    async getProfileStats() {
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
            return stats;
        } catch (error) {
            console.error('[ProfileService] Error getting profile stats:', error);
            throw error;
        }
    }


    /**
     * Get merged beta features combining JSON field with individual columns
     */
    getMergedBetaFeatures(profile) {
        const profileBetaFeatures = profile.beta_features || {};
        const profileSettingsAsBetaFeatures = {
            igel_modus: profile.igel_modus || false,
            bundestag_api_enabled: profile.bundestag_api_enabled || false,
            groups: profile.groups_enabled || false,
            customGenerators: profile.custom_generators || false,
            database: profile.database_access || false,
            you: profile.you_generator || false,
            collab: profile.collab || false,
            qa: profile.qa || false,
            sharepic: profile.sharepic || false,
            anweisungen: profile.anweisungen || false,
            memory: profile.memory || false
        };
        
        return {
            ...profileBetaFeatures,
            ...profileSettingsAsBetaFeatures
        };
    }

    /**
     * Update session user object with profile changes
     */
    updateUserSession(sessionUser, profile, feature = null, enabled = null) {
        // Update beta_features
        sessionUser.beta_features = this.getMergedBetaFeatures(profile);
        
        // Update individual profile settings for compatibility
        const featureMap = {
            'igel_modus': 'igel_modus',
            'bundestag_api_enabled': 'bundestag_api_enabled',
            'groups': 'groups_enabled',
            'customGenerators': 'custom_generators',
            'database': 'database_access',
            'you': 'you_generator',
            'collab': 'collab',
            'qa': 'qa',
            'sharepic': 'sharepic',
            'anweisungen': 'anweisungen',
            'memory': 'memory'
        };

        // Update all individual properties from profile
        Object.entries(featureMap).forEach(([key, column]) => {
            sessionUser[column] = Boolean(profile[column]);
            // Also update the key format if different
            if (key !== column) {
                sessionUser[key] = Boolean(profile[column]);
            }
        });

        // If a specific feature was updated, ensure it's set correctly
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
    async healthCheck() {
        try {
            await this.db.ensureInitialized();
            const result = await this.db.query('SELECT COUNT(*) as count FROM profiles LIMIT 1');
            return {
                status: 'healthy',
                database: 'postgresql',
                profileCount: result[0]?.count || 0
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                database: 'postgresql',
                error: error.message
            };
        }
    }
}

// Export singleton instance
let profileServiceInstance = null;

export function getProfileService() {
    if (!profileServiceInstance) {
        profileServiceInstance = new ProfileService();
    }
    return profileServiceInstance;
}

export { ProfileService };
export default ProfileService;