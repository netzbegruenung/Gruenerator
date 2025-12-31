const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');
// Lazily import ESM PostgresService from CJS context when needed

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
    this.profileService = null;
    this.db = null;
  }

  async getDb() {
    if (this.db) return this.db;
    const { getPostgresInstance } = await import('../database/services/PostgresService.js');
    this.db = getPostgresInstance();
    return this.db;
  }

  async init() {
    if (!this.profileService) {
      const { getProfileService } = await import('./ProfileService.mjs');
      this.profileService = getProfileService();
    }
  }

  /**
   * Find user in Grünerator database by various identifiers
   */
  async findUserInGruenerator(user) {
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
        { column: 'sherpa_id', value: user.sherpa_id } // If sherpa_id is a separate field
      ].filter(q => q.value);

      for (const query of queries) {
        const result = await (await this.getDb()).queryOne(
          `SELECT * FROM profiles WHERE ${query.column} = $1`,
          [query.value]
        );
        if (result) return result;
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

      logger.info(`Successfully deleted user ${userId} from database`);
      
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
    await this.init();
    try {
      // Anonymize user data in profiles table
      await this.profileService.updateProfile(userId, {
        email: `anonymized_${userId}@example.com`,
        username: `anonymized_${userId}`,
        display_name: 'Anonymized User',
        keycloak_id: null,
        sherpa_id: null,
        first_name: null,
        last_name: null,
        avatar_url: null,
        // Add any other fields that need anonymization
        anonymized_at: new Date().toISOString()
      });

      logger.info(`Successfully anonymized user ${userId} in database`);
      
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

    // Database validation is handled by ProfileService and PostgresService initialization
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
