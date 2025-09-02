import { getDatabaseAdapter } from '../database/services/DatabaseAdapter.js';
import { supabaseService } from '../utils/supabaseClient.js';

/**
 * ProfileService - Centralized service for user profile operations
 * Handles profile CRUD operations with database abstraction
 * Supports migration from Supabase to PostgreSQL
 */
class ProfileService {
    constructor() {
        this.db = getDatabaseAdapter();
        this.usePostgres = process.env.DATABASE_TYPE === 'postgres';
        this.tableName = 'profiles';
    }

    /**
     * Initialize the service
     */
    async init() {
        if (this.usePostgres) {
            await this.db.init();
        }
    }

    /**
     * Get user profile by ID
     */
    async getProfileById(userId) {
        try {
            if (this.usePostgres) {
                await this.db.ensureInitialized();
                const profile = await this.db.queryOne(
                    'SELECT * FROM profiles WHERE id = $1',
                    [userId],
                    { table: this.tableName }
                );
                return profile;
            } else {
                // Fallback to Supabase
                const { data: profile, error } = await supabaseService
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();
                
                if (error && error.code !== 'PGRST116') {
                    throw new Error(error.message);
                }
                return profile;
            }
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
            if (this.usePostgres) {
                await this.db.ensureInitialized();
                const profile = await this.db.queryOne(
                    'SELECT * FROM profiles WHERE keycloak_id = $1',
                    [keycloakId],
                    { table: this.tableName }
                );
                return profile;
            } else {
                // Fallback to Supabase
                const { data: profile, error } = await supabaseService
                    .from('profiles')
                    .select('*')
                    .eq('keycloak_id', keycloakId)
                    .single();
                
                if (error && error.code !== 'PGRST116') {
                    throw new Error(error.message);
                }
                return profile;
            }
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
            if (this.usePostgres) {
                await this.db.ensureInitialized();
                const profile = await this.db.queryOne(
                    'SELECT * FROM profiles WHERE email = $1',
                    [email],
                    { table: this.tableName }
                );
                return profile;
            } else {
                // Fallback to Supabase
                const { data: profile, error } = await supabaseService
                    .from('profiles')
                    .select('*')
                    .eq('email', email)
                    .single();
                
                if (error && error.code !== 'PGRST116') {
                    throw new Error(error.message);
                }
                return profile;
            }
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
            const now = new Date().toISOString();
            const newProfile = {
                ...profileData,
                updated_at: now,
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

            if (this.usePostgres) {
                await this.db.ensureInitialized();
                const result = await this.db.insert(this.tableName, newProfile);
                return result;
            } else {
                // Fallback to Supabase
                const { data, error } = await supabaseService
                    .from('profiles')
                    .insert(newProfile)
                    .select()
                    .single();
                
                if (error) {
                    throw new Error(error.message);
                }
                return data;
            }
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
            const now = new Date().toISOString();
            const dataToUpdate = {
                ...updateData,
                updated_at: now
            };

            if (this.usePostgres) {
                await this.db.ensureInitialized();
                const result = await this.db.update(this.tableName, dataToUpdate, { id: userId });
                return result.data[0];
            } else {
                // Fallback to Supabase
                const { data, error } = await supabaseService
                    .from('profiles')
                    .update(dataToUpdate)
                    .eq('id', userId)
                    .select()
                    .single();
                
                if (error) {
                    throw new Error(error.message);
                }
                return data;
            }
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
            const now = new Date().toISOString();
            const dataToUpsert = {
                ...profileData,
                updated_at: now
            };

            if (this.usePostgres) {
                await this.db.ensureInitialized();
                const result = await this.db.upsert(this.tableName, dataToUpsert, ['id']);
                return result;
            } else {
                // Fallback to Supabase
                const { data, error } = await supabaseService
                    .from('profiles')
                    .upsert(dataToUpsert)
                    .select()
                    .single();
                
                if (error) {
                    throw new Error(error.message);
                }
                return data;
            }
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
                'groups': 'groups',
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
            console.log(`[ProfileService] Avatar updated for user ${userId}: ${avatarRobotId}`);
            return result;
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
            if (this.usePostgres) {
                await this.db.ensureInitialized();
                const result = await this.db.delete(this.tableName, { id: userId });
                return result;
            } else {
                // Fallback to Supabase
                const { data, error } = await supabaseService
                    .from('profiles')
                    .delete()
                    .eq('id', userId)
                    .select();
                
                if (error) {
                    throw new Error(error.message);
                }
                return { changes: data.length, data };
            }
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
            if (this.usePostgres) {
                await this.db.ensureInitialized();
                const profiles = await this.db.query(
                    'SELECT * FROM profiles ORDER BY created_at DESC LIMIT $1 OFFSET $2',
                    [limit, offset],
                    { table: this.tableName }
                );
                return profiles;
            } else {
                // Fallback to Supabase
                const { data: profiles, error } = await supabaseService
                    .from('profiles')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .range(offset, offset + limit - 1);
                
                if (error) {
                    throw new Error(error.message);
                }
                return profiles;
            }
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
            if (this.usePostgres) {
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
            } else {
                // Would need multiple queries for Supabase - simplified for now
                const { data: profiles, error } = await supabaseService
                    .from('profiles')
                    .select('igel_modus, bundestag_api_enabled, memory_enabled, last_login');
                
                if (error) {
                    throw new Error(error.message);
                }

                const now = new Date();
                const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

                return {
                    total_profiles: profiles.length,
                    igel_users: profiles.filter(p => p.igel_modus).length,
                    bundestag_users: profiles.filter(p => p.bundestag_api_enabled).length,
                    memory_users: profiles.filter(p => p.memory_enabled).length,
                    active_users: profiles.filter(p => p.last_login && new Date(p.last_login) > thirtyDaysAgo).length
                };
            }
        } catch (error) {
            console.error('[ProfileService] Error getting profile stats:', error);
            throw error;
        }
    }

    /**
     * Migrate profiles from Supabase to PostgreSQL
     */
    async migrateFromSupabase() {
        try {
            if (!this.usePostgres) {
                throw new Error('PostgreSQL must be configured for migration');
            }

            console.log('[ProfileService] Starting migration from Supabase to PostgreSQL...');

            // Get all profiles from Supabase
            const { data: profiles, error } = await supabaseService
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: true });

            if (error) {
                throw new Error(`Failed to fetch profiles from Supabase: ${error.message}`);
            }

            console.log(`[ProfileService] Found ${profiles.length} profiles to migrate`);

            // Initialize PostgreSQL
            await this.db.ensureInitialized();

            // Bulk insert profiles
            if (profiles.length > 0) {
                const result = await this.db.bulkInsert(this.tableName, profiles);
                console.log(`[ProfileService] Successfully migrated ${result.length} profiles`);
                return result;
            } else {
                console.log('[ProfileService] No profiles to migrate');
                return [];
            }

        } catch (error) {
            console.error('[ProfileService] Migration failed:', error);
            throw error;
        }
    }

    /**
     * Health check for the service
     */
    async healthCheck() {
        try {
            if (this.usePostgres) {
                await this.db.ensureInitialized();
                const result = await this.db.query('SELECT COUNT(*) as count FROM profiles LIMIT 1');
                return {
                    status: 'healthy',
                    database: 'postgresql',
                    profileCount: result[0]?.count || 0
                };
            } else {
                const { count, error } = await supabaseService
                    .from('profiles')
                    .select('*', { count: 'exact', head: true });

                if (error) {
                    throw new Error(error.message);
                }

                return {
                    status: 'healthy',
                    database: 'supabase',
                    profileCount: count || 0
                };
            }
        } catch (error) {
            return {
                status: 'unhealthy',
                database: this.usePostgres ? 'postgresql' : 'supabase',
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