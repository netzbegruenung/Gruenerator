const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');
const { supabaseService } = require('../utils/supabaseClient');

// Configuration constants
const RETRY_FILE = '/var/tmp/gruenerator-offboarding-retry.json';
const CONFIG = {
  GRUENE_API_BASEURL: process.env.GRUENE_API_BASEURL || 'https://app.gruene.de',
  GRUENE_API_USERNAME: process.env.GRUENE_API_USERNAME,
  GRUENE_API_PASSWORD: process.env.GRUENE_API_PASSWORD,
  GRUENE_API_KEY: process.env.GRUENE_API_KEY,
  BATCH_SIZE: 200,
  REQUEST_LIMIT: 1000
};

// Setup logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/offboarding.log' })
  ],
});

/**
 * Grüne API Client for offboarding operations
 */
class GrueneApiClient {
  constructor(config) {
    this.baseUrl = config.GRUENE_API_BASEURL;
    this.username = config.GRUENE_API_USERNAME;
    this.password = config.GRUENE_API_PASSWORD;
    this.apiKey = config.GRUENE_API_KEY;
    
    // Create axios instance with retry configuration
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      }
    });

    // Setup authentication
    if (this.apiKey) {
      this.client.defaults.headers['x-api-key'] = this.apiKey;
    } else if (this.username && this.password) {
      this.client.defaults.auth = {
        username: this.username,
        password: this.password
      };
    }
  }

  /**
   * Fetch users that need offboarding
   */
  async findUsersToOffboard(limit = 1000, after = null) {
    try {
      const response = await this.client.get('/v1/offboarding/users/self', {
        params: { limit, after }
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch users from Grüne API:', error.message);
      throw error;
    }
  }

  /**
   * Report batch of processed users back to API
   */
  async batchUpdateOffboardingUsers(upserts) {
    try {
      const response = await this.client.post('/v1/offboarding/users/self/batch', {
        upsert: upserts
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to report processed users to Grüne API:', error.message);
      throw error;
    }
  }
}

/**
 * Grünerator-specific offboarding operations
 */
class GrueneratorOffboarding {
  constructor() {
    this.supabase = supabaseService;
  }

  /**
   * Find user in Grünerator database by various identifiers
   */
  async findUserInGruenerator(user) {
    if (!this.supabase) {
      throw new Error('Supabase client not initialized');
    }

    try {
      // Try to find user by email, username, keycloak_id, or sherpa_id
      const queries = [
        { column: 'email', value: user.email },
        { column: 'username', value: user.username },
        { column: 'keycloak_id', value: user.sherpa_id }, // Map sherpa_id to keycloak_id
        { column: 'sherpa_id', value: user.sherpa_id } // Also try direct sherpa_id if it exists
      ].filter(q => q.value); // Only query for fields that exist

      for (const query of queries) {
        const { data, error } = await this.supabase
          .from('profiles')
          .select('*')
          .eq(query.column, query.value)
          .single();

        if (!error && data) {
          return data;
        }
      }

      return null;
    } catch (error) {
      logger.error(`Error finding user in Grünerator:`, error.message);
      throw error;
    }
  }

  /**
   * Delete user from Grünerator database
   */
  async deleteUser(userId) {
    if (!this.supabase) {
      throw new Error('Supabase client not initialized');
    }

    try {
      // Delete user data from all relevant tables
      // Delete from related tables first (foreign key constraints)
      await this.supabase.from('group_memberships').delete().eq('user_id', userId);
      await this.supabase.from('user_sharepics').delete().eq('user_id', userId);
      await this.supabase.from('user_uploads').delete().eq('user_id', userId);
      await this.supabase.from('documents').delete().eq('user_id', userId);
      
      // Delete from profiles table
      const { error: profileError } = await this.supabase
        .from('profiles')
        .delete()
        .eq('id', userId);
      
      if (profileError) {
        throw profileError;
      }
      
      // Also delete from Supabase Auth
      const { error: authError } = await this.supabase.auth.admin.deleteUser(userId);
      if (authError) {
        logger.warn(`Failed to delete auth user ${userId}: ${authError.message}`);
      }

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      logger.error(`Error deleting user ${userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Anonymize user in Grünerator database
   */
  async anonymizeUser(userId) {
    if (!this.supabase) {
      throw new Error('Supabase client not initialized');
    }

    try {
      // Anonymize user data in profiles table
      const { error: profileError } = await this.supabase
        .from('profiles')
        .update({
          email: `anonymized_${userId}@example.com`,
          username: `anonymized_${userId}`,
          display_name: 'Anonymized User',
          keycloak_id: null,
          sherpa_id: null,
          // Add other fields that need anonymization
          anonymized_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (profileError) {
        throw profileError;
      }
      
      // Also anonymize in Supabase Auth
      const { error: authError } = await this.supabase.auth.admin.updateUserById(userId, {
        email: `anonymized_${userId}@example.com`,
        user_metadata: {
          name: 'Anonymized User',
          username: `anonymized_${userId}`,
          anonymized: true,
          anonymized_at: new Date().toISOString()
        }
      });
      
      if (authError) {
        logger.warn(`Failed to anonymize auth user ${userId}: ${authError.message}`);
      }

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      logger.error(`Error anonymizing user ${userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Process individual user for offboarding
   * Returns [status, message] tuple
   */
  async processUser(user) {
    try {
      const grueneratorUser = await this.findUserInGruenerator(user);
      
      if (!grueneratorUser) {
        return ['not_found', 'User not found in Grünerator database'];
      }

      // Try to delete user first
      try {
        await this.deleteUser(grueneratorUser.id);
        return ['deleted', `Successfully deleted user ${grueneratorUser.id}`];
      } catch (deleteError) {
        logger.warn(`Could not delete user ${grueneratorUser.id}, attempting anonymization:`, deleteError.message);
        
        // If deletion fails, try anonymization
        try {
          await this.anonymizeUser(grueneratorUser.id);
          return ['anonymized', `Successfully anonymized user ${grueneratorUser.id}`];
        } catch (anonymizeError) {
          logger.error(`Failed to anonymize user ${grueneratorUser.id}:`, anonymizeError.message);
          return ['failed', `Failed to delete or anonymize user: ${anonymizeError.message}`];
        }
      }
    } catch (error) {
      logger.error(`Error processing user ${user.username}:`, error.message);
      return ['failed', `Processing error: ${error.message}`];
    }
  }
}

/**
 * Retry mechanism for failed API calls
 */
class RetryManager {
  static async loadRetries() {
    try {
      const data = await fs.readFile(RETRY_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  static async saveRetries(data) {
    try {
      await fs.writeFile(RETRY_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Failed to save retry data:', error.message);
      throw error;
    }
  }

  static async processRetries(apiClient) {
    const retries = await this.loadRetries();
    if (!retries || retries.length === 0) {
      return;
    }

    try {
      await apiClient.batchUpdateOffboardingUsers(retries);
      await this.saveRetries([]);
      logger.info(`Successfully processed ${retries.length} retry entries`);
    } catch (error) {
      logger.error('Failed to process retries:', error.message);
      throw error;
    }
  }
}

/**
 * Main offboarding service
 */
class OffboardingService {
  constructor() {
    this.apiClient = new GrueneApiClient(CONFIG);
    this.grueneratorOffboarding = new GrueneratorOffboarding();
  }

  /**
   * Generator function to fetch all users needing offboarding
   */
  async* fetchOffboardingUsers() {
    let after = null;
    
    while (true) {
      try {
        const response = await this.apiClient.findUsersToOffboard(CONFIG.REQUEST_LIMIT, after);
        const users = response.data || [];
        
        for (const user of users) {
          yield user;
        }

        after = response.meta?.cursorNext;
        if (!after) {
          break;
        }
      } catch (error) {
        logger.error('Failed to fetch users from API:', error.message);
        break;
      }
    }
  }

  /**
   * Process users in batches
   */
  async* processUserBatches() {
    const upserts = [];
    
    for await (const user of this.fetchOffboardingUsers()) {
      try {
        const [status, message] = await this.grueneratorOffboarding.processUser(user);
        
        if (status === 'failed') {
          logger.warn(`User processing failed: ${user.username} - ${message}`);
          continue;
        }

        logger.info(`User processed: ${user.username} - ${status} - ${message}`);
        
        upserts.push({
          id: user.id,
          status: status
        });

        if (upserts.length >= CONFIG.BATCH_SIZE) {
          yield [...upserts];
          upserts.length = 0; // Clear array
        }
      } catch (error) {
        logger.error(`Error processing user ${user.username}:`, error.message);
        break;
      }
    }

    if (upserts.length > 0) {
      yield upserts;
    }
  }

  /**
   * Run the complete offboarding process
   */
  async runOffboarding() {
    logger.info('Starting Grünerator offboarding process');

    try {
      // First, process any retries
      await RetryManager.processRetries(this.apiClient);
    } catch (error) {
      logger.error('Retry processing failed:', error.message);
      return false;
    }

    // Process new offboarding requests
    for await (const batch of this.processUserBatches()) {
      try {
        await this.apiClient.batchUpdateOffboardingUsers(batch);
        logger.info(`Successfully reported ${batch.length} processed users to API`);
      } catch (error) {
        logger.error('Failed to report processed users to API:', error.message);
        
        try {
          await RetryManager.saveRetries(batch);
          logger.info('Saved failed batch for retry');
        } catch (retryError) {
          logger.error('Failed to save retry data:', retryError.message);
        }
        break;
      }
    }

    logger.info('Offboarding process completed');
    return true;
  }

  /**
   * Validate configuration
   */
  static validateConfig() {
    const required = ['GRUENE_API_BASEURL'];
    const authRequired = ['GRUENE_API_USERNAME', 'GRUENE_API_PASSWORD'];
    const apiKeyRequired = ['GRUENE_API_KEY'];
    
    const missing = required.filter(key => !CONFIG[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }

    // Check that either basic auth or API key is configured
    const hasBasicAuth = authRequired.every(key => CONFIG[key]);
    const hasApiKey = apiKeyRequired.every(key => CONFIG[key]);
    
    if (!hasBasicAuth && !hasApiKey) {
      throw new Error('Either basic auth (username/password) or API key must be configured');
    }

    if (!supabaseService) {
      throw new Error('Supabase service client not initialized');
    }
  }
}

/**
 * CLI entry point for standalone execution
 */
async function runOffboardingCLI() {
  try {
    OffboardingService.validateConfig();
    const service = new OffboardingService();
    const success = await service.runOffboarding();
    process.exit(success ? 0 : 1);
  } catch (error) {
    logger.error('Offboarding service failed:', error.message);
    process.exit(1);
  }
}

module.exports = {
  OffboardingService,
  GrueneApiClient,
  GrueneratorOffboarding,
  RetryManager,
  runOffboardingCLI
};

// If this file is run directly (not imported), execute CLI
if (require.main === module) {
  runOffboardingCLI();
} 