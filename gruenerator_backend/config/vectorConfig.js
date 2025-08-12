/**
 * Centralized configuration management for vector backend
 * Replaces hardcoded magic numbers and provides environment-based configuration
 */

/**
 * Load configuration from environment variables with defaults
 */
class VectorConfig {
  constructor() {
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }

  /**
   * Load all configuration values
   * @private
   */
  loadConfiguration() {
    return {
      // Search thresholds and limits
      search: {
        defaultThreshold: parseFloat(process.env.VECTOR_SEARCH_THRESHOLD || '0.3'),
        minThreshold: parseFloat(process.env.VECTOR_MIN_THRESHOLD || '0.2'),
        maxThreshold: parseFloat(process.env.VECTOR_MAX_THRESHOLD || '0.8'),
        defaultLimit: parseInt(process.env.VECTOR_DEFAULT_LIMIT || '5'),
        maxLimit: parseInt(process.env.VECTOR_MAX_LIMIT || '100'),
        chunkMultiplier: parseFloat(process.env.VECTOR_CHUNK_MULTIPLIER || '3.0'), // Get N times more chunks for ranking
        
        // Dynamic threshold adjustments
        lengthAdjustments: {
          singleWord: parseFloat(process.env.VECTOR_SINGLE_WORD_ADJ || '0.0'),
          twoWords: parseFloat(process.env.VECTOR_TWO_WORDS_ADJ || '0.05'),
          manyWords: parseFloat(process.env.VECTOR_MANY_WORDS_ADJ || '-0.1'),
          manyWordsThreshold: parseInt(process.env.VECTOR_MANY_WORDS_THRESHOLD || '5')
        }
      },

      // Hybrid search configuration
      hybrid: {
        vectorWeight: parseFloat(process.env.HYBRID_VECTOR_WEIGHT || '0.7'),
        keywordWeight: parseFloat(process.env.HYBRID_KEYWORD_WEIGHT || '0.3'),
        vectorMultiplier: parseFloat(process.env.HYBRID_VECTOR_MULTIPLIER || '3.0'),
        keywordMultiplier: parseFloat(process.env.HYBRID_KEYWORD_MULTIPLIER || '2.0')
      },

      // Document scoring configuration
      scoring: {
        maxSimilarityWeight: parseFloat(process.env.SCORING_MAX_SIMILARITY_WEIGHT || '0.5'),
        avgSimilarityWeight: parseFloat(process.env.SCORING_AVG_SIMILARITY_WEIGHT || '0.3'),
        positionWeight: parseFloat(process.env.SCORING_POSITION_WEIGHT || '0.2'),
        positionDecayRate: parseFloat(process.env.SCORING_POSITION_DECAY || '0.1'),
        minPositionWeight: parseFloat(process.env.SCORING_MIN_POSITION_WEIGHT || '0.3'),
        diversityBonusRate: parseFloat(process.env.SCORING_DIVERSITY_BONUS_RATE || '0.05'),
        maxDiversityBonus: parseFloat(process.env.SCORING_MAX_DIVERSITY_BONUS || '0.2'),
        maxFinalScore: parseFloat(process.env.SCORING_MAX_FINAL_SCORE || '1.0')
      },

      // Content processing
      content: {
        maxExcerptLength: parseInt(process.env.CONTENT_MAX_EXCERPT_LENGTH || '300'),
        excerptSentenceBoundary: parseFloat(process.env.CONTENT_EXCERPT_SENTENCE_BOUNDARY || '0.7'),
        maxChunksPerDocument: parseInt(process.env.CONTENT_MAX_CHUNKS_PER_DOC || '3'),
        keywordContextLength: parseInt(process.env.CONTENT_KEYWORD_CONTEXT_LENGTH || '500'),
        keywordContextRatio: parseFloat(process.env.CONTENT_KEYWORD_CONTEXT_RATIO || '0.33')
      },

      // Embedding configuration
      embeddings: {
        maxDimensions: parseInt(process.env.EMBEDDING_MAX_DIMENSIONS || '10000'),
        maxValue: parseFloat(process.env.EMBEDDING_MAX_VALUE || '100'),
        minValue: parseFloat(process.env.EMBEDDING_MIN_VALUE || '-100'),
        validationTimeout: parseInt(process.env.EMBEDDING_VALIDATION_TIMEOUT || '5000')
      },

      // Smart query expansion
      queryExpansion: {
        maxExpansions: parseInt(process.env.QUERY_MAX_EXPANSIONS || '5'),
        originalWeight: parseFloat(process.env.QUERY_ORIGINAL_WEIGHT || '1.0'),
        expansionBaseWeight: parseFloat(process.env.QUERY_EXPANSION_BASE_WEIGHT || '0.6'),
        confidenceBoostWeight: parseFloat(process.env.QUERY_CONFIDENCE_BOOST_WEIGHT || '1.0'),
        semanticConfidenceWeight: parseFloat(process.env.QUERY_SEMANTIC_CONFIDENCE_WEIGHT || '0.5'),
        feedbackConfidenceWeight: parseFloat(process.env.QUERY_FEEDBACK_CONFIDENCE_WEIGHT || '0.5')
      },

      // Cache configuration
      cache: {
        searchEnhancement: {
          maxSize: parseInt(process.env.CACHE_ENHANCEMENT_SIZE || '100'),
          ttl: parseInt(process.env.CACHE_ENHANCEMENT_TTL || '1800000') // 30 minutes
        },
        searchResults: {
          maxSize: parseInt(process.env.CACHE_RESULTS_SIZE || '200'),
          ttl: parseInt(process.env.CACHE_RESULTS_TTL || '900000') // 15 minutes
        },
        embeddings: {
          maxSize: parseInt(process.env.CACHE_EMBEDDINGS_SIZE || '500'),
          ttl: parseInt(process.env.CACHE_EMBEDDINGS_TTL || '3600000') // 1 hour
        },
        baseService: {
          maxSize: parseInt(process.env.CACHE_BASE_SIZE || '100'),
          ttl: parseInt(process.env.CACHE_BASE_TTL || '1800000') // 30 minutes
        }
      },

      // Timeouts
      timeouts: {
        searchDefault: parseInt(process.env.TIMEOUT_SEARCH_DEFAULT || '15000'), // 15 seconds
        aiWorker: parseInt(process.env.TIMEOUT_AI_WORKER || '15000'),
        autonomousSearch: parseInt(process.env.TIMEOUT_AUTONOMOUS_SEARCH || '30000'), // 2x for complex searches
        embeddingGeneration: parseInt(process.env.TIMEOUT_EMBEDDING || '10000'),
        databaseRPC: parseInt(process.env.TIMEOUT_DATABASE_RPC || '20000')
      },

      // AI Worker configuration
      aiWorker: {
        haiku: {
          model: process.env.AI_HAIKU_MODEL || 'anthropic.claude-3-haiku-20240307-v1:0',
          maxTokens: parseInt(process.env.AI_HAIKU_MAX_TOKENS || '1000'),
          temperature: parseFloat(process.env.AI_HAIKU_TEMPERATURE || '0.3'),
          provider: process.env.AI_HAIKU_PROVIDER || 'bedrock'
        },
        autonomous: {
          maxTokens: parseInt(process.env.AI_AUTONOMOUS_MAX_TOKENS || '2000'),
          temperature: parseFloat(process.env.AI_AUTONOMOUS_TEMPERATURE || '0.2')
        }
      },

      // Context expansion configuration
      contextExpansion: {
        maxContextTokens: parseInt(process.env.CONTEXT_MAX_TOKENS || '2000'),
        includePrevious: process.env.CONTEXT_INCLUDE_PREVIOUS !== 'false',
        includeNext: process.env.CONTEXT_INCLUDE_NEXT !== 'false',
        includeRelated: process.env.CONTEXT_INCLUDE_RELATED !== 'false',
        preserveStructure: process.env.CONTEXT_PRESERVE_STRUCTURE !== 'false',
        tokenUsageThreshold: parseFloat(process.env.CONTEXT_TOKEN_USAGE_THRESHOLD || '0.8'),
        relatedStrengthThreshold: parseFloat(process.env.CONTEXT_RELATED_STRENGTH_THRESHOLD || '0.8'),
        maxRelatedChunks: parseInt(process.env.CONTEXT_MAX_RELATED_CHUNKS || '2')
      },

      // Database examples search
      databaseExamples: {
        maxResults: parseInt(process.env.DB_EXAMPLES_MAX_RESULTS || '10'),
        defaultThreshold: parseFloat(process.env.DB_EXAMPLES_THRESHOLD || '0.25'),
        maxContentTypeLength: parseInt(process.env.DB_EXAMPLES_MAX_CONTENT_TYPE_LENGTH || '50')
      },

      // Validation limits
      validation: {
        maxQueryLength: parseInt(process.env.VALIDATION_MAX_QUERY_LENGTH || '10000'),
        maxUserIdLength: parseInt(process.env.VALIDATION_MAX_USER_ID_LENGTH || '100'),
        maxDocumentIds: parseInt(process.env.VALIDATION_MAX_DOCUMENT_IDS || '1000'),
        maxDocumentIdLength: parseInt(process.env.VALIDATION_MAX_DOCUMENT_ID_LENGTH || '100'),
        maxMessageLength: parseInt(process.env.VALIDATION_MAX_MESSAGE_LENGTH || '50000'),
        maxContentTypeLength: parseInt(process.env.VALIDATION_MAX_CONTENT_TYPE_LENGTH || '50')
      },

      // Logging and monitoring
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        enableTelemetry: process.env.ENABLE_TELEMETRY !== 'false',
        enableVerbose: process.env.ENABLE_VERBOSE === 'true',
        enableDebug: process.env.ENABLE_DEBUG === 'true'
      },

      // Performance tuning
      performance: {
        maxConcurrentSearches: parseInt(process.env.PERF_MAX_CONCURRENT_SEARCHES || '10'),
        batchSize: parseInt(process.env.PERF_BATCH_SIZE || '10'),
        maxRetries: parseInt(process.env.PERF_MAX_RETRIES || '3'),
        retryDelay: parseInt(process.env.PERF_RETRY_DELAY || '1000')
      }
    };
  }

  /**
   * Validate configuration values
   * @private
   */
  validateConfiguration() {
    const config = this.config;
    
    // Validate threshold ranges
    if (config.search.defaultThreshold < 0 || config.search.defaultThreshold > 1) {
      throw new Error('VECTOR_SEARCH_THRESHOLD must be between 0 and 1');
    }
    
    if (config.search.minThreshold >= config.search.maxThreshold) {
      throw new Error('VECTOR_MIN_THRESHOLD must be less than VECTOR_MAX_THRESHOLD');
    }
    
    // Validate weights sum to 1 for hybrid search
    const hybridWeightSum = config.hybrid.vectorWeight + config.hybrid.keywordWeight;
    if (Math.abs(hybridWeightSum - 1.0) > 0.01) {
      console.warn(`[VectorConfig] Hybrid weights sum to ${hybridWeightSum}, should be 1.0`);
    }
    
    // Validate scoring weights
    const scoringWeightSum = config.scoring.maxSimilarityWeight + 
                           config.scoring.avgSimilarityWeight + 
                           config.scoring.positionWeight;
    if (Math.abs(scoringWeightSum - 1.0) > 0.01) {
      console.warn(`[VectorConfig] Scoring weights sum to ${scoringWeightSum}, should be 1.0`);
    }
    
    // Validate positive values
    const positiveValues = [
      'search.defaultLimit', 'search.maxLimit',
      'content.maxExcerptLength', 'content.maxChunksPerDocument',
      'timeouts.searchDefault', 'timeouts.aiWorker'
    ];
    
    positiveValues.forEach(path => {
      const value = this.getNestedValue(config, path);
      if (value <= 0) {
        throw new Error(`Configuration ${path} must be positive, got ${value}`);
      }
    });
    
    console.log(`[VectorConfig] Configuration validated successfully`);
  }

  /**
   * Get nested configuration value
   * @param {Object} obj - Configuration object
   * @param {string} path - Dot-separated path
   * @returns {*} Configuration value
   * @private
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }

  /**
   * Get configuration section
   * @param {string} section - Configuration section name
   * @returns {Object} Configuration section
   */
  get(section) {
    if (!this.config[section]) {
      throw new Error(`Configuration section '${section}' not found`);
    }
    return this.config[section];
  }

  /**
   * Get specific configuration value
   * @param {string} path - Dot-separated path to value
   * @returns {*} Configuration value
   */
  getValue(path) {
    const value = this.getNestedValue(this.config, path);
    if (value === undefined) {
      throw new Error(`Configuration value '${path}' not found`);
    }
    return value;
  }

  /**
   * Check if debug mode is enabled
   * @returns {boolean} True if debug mode is enabled
   */
  isDebugMode() {
    return this.config.logging.enableDebug;
  }

  /**
   * Check if verbose mode is enabled
   * @returns {boolean} True if verbose mode is enabled
   */
  isVerboseMode() {
    return this.config.logging.enableVerbose || this.config.logging.enableDebug;
  }

  /**
   * Get cache configuration for specific cache type
   * @param {string} cacheType - Cache type
   * @returns {Object} Cache configuration
   */
  getCacheConfig(cacheType) {
    const cacheConfig = this.config.cache[cacheType];
    if (!cacheConfig) {
      console.warn(`[VectorConfig] Unknown cache type '${cacheType}', using default`);
      return this.config.cache.baseService;
    }
    return cacheConfig;
  }

  /**
   * Export configuration summary for logging
   * @returns {Object} Configuration summary
   */
  getSummary() {
    return {
      search: {
        defaultThreshold: this.config.search.defaultThreshold,
        defaultLimit: this.config.search.defaultLimit,
        maxLimit: this.config.search.maxLimit
      },
      cache: {
        totalMaxSize: Object.values(this.config.cache).reduce((sum, cache) => sum + cache.maxSize, 0)
      },
      timeouts: this.config.timeouts,
      performance: this.config.performance,
      logging: this.config.logging
    };
  }
}

// Create singleton instance
const vectorConfig = new VectorConfig();

// Log configuration summary on startup
if (vectorConfig.isVerboseMode()) {
  console.log('[VectorConfig] Loaded configuration:', vectorConfig.getSummary());
}

module.exports = {
  vectorConfig,
  VectorConfig
};