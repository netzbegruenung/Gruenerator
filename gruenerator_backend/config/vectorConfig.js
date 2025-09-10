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

      // Hybrid search specific configuration
      hybrid: {
        // Dynamic threshold adjustment based on text match presence
        minVectorOnlyThreshold: parseFloat(process.env.HYBRID_MIN_VECTOR_ONLY_THRESHOLD || '0.55'),
        minVectorWithTextThreshold: parseFloat(process.env.HYBRID_MIN_VECTOR_WITH_TEXT_THRESHOLD || '0.35'),
        
        // Post-fusion quality gates (RRF-appropriate thresholds with k=60)
        minFinalScore: parseFloat(process.env.HYBRID_MIN_FINAL_SCORE || '0.008'),
        minVectorOnlyFinalScore: parseFloat(process.env.HYBRID_MIN_VECTOR_ONLY_FINAL_SCORE || '0.010'),
        
        // Confidence weighting for RRF
        confidenceBoost: parseFloat(process.env.HYBRID_CONFIDENCE_BOOST || '1.2'),
        confidencePenalty: parseFloat(process.env.HYBRID_CONFIDENCE_PENALTY || '0.7'),
        
        // Enable/disable features
        enableDynamicThresholds: process.env.HYBRID_ENABLE_DYNAMIC_THRESHOLDS !== 'false',
        enableConfidenceWeighting: process.env.HYBRID_ENABLE_CONFIDENCE_WEIGHTING !== 'false',
        enableQualityGate: process.env.HYBRID_ENABLE_QUALITY_GATE !== 'false'
      },


      // Document scoring configuration (simplified)
      scoring: {
        maxSimilarityWeight: parseFloat(process.env.SCORING_MAX_SIMILARITY_WEIGHT || '0.6'),
        avgSimilarityWeight: parseFloat(process.env.SCORING_AVG_SIMILARITY_WEIGHT || '0.4'),
        diversityBonusRate: parseFloat(process.env.SCORING_DIVERSITY_BONUS_RATE || '0.02'),
        maxDiversityBonus: parseFloat(process.env.SCORING_MAX_DIVERSITY_BONUS || '0.1'),
        maxFinalScore: parseFloat(process.env.SCORING_MAX_FINAL_SCORE || '1.0')
      },

      // Content processing
      content: {
        maxExcerptLength: parseInt(process.env.CONTENT_MAX_EXCERPT_LENGTH || '300'),
        excerptSentenceBoundary: parseFloat(process.env.CONTENT_EXCERPT_SENTENCE_BOUNDARY || '0.7'),
        maxChunksPerDocument: parseInt(process.env.CONTENT_MAX_CHUNKS_PER_DOC || '3')
      },

      // Embedding configuration
      embeddings: {
        maxDimensions: parseInt(process.env.EMBEDDING_MAX_DIMENSIONS || '10000'),
        maxValue: parseFloat(process.env.EMBEDDING_MAX_VALUE || '100'),
        minValue: parseFloat(process.env.EMBEDDING_MIN_VALUE || '-100'),
        validationTimeout: parseInt(process.env.EMBEDDING_VALIDATION_TIMEOUT || '5000')
      },


      // Cache configuration (simplified)
      cache: {
        searchResults: {
          maxSize: parseInt(process.env.CACHE_RESULTS_SIZE || '200'),
          ttl: parseInt(process.env.CACHE_RESULTS_TTL || '900000') // 15 minutes
        },
        embeddings: {
          maxSize: parseInt(process.env.CACHE_EMBEDDINGS_SIZE || '500'),
          ttl: parseInt(process.env.CACHE_EMBEDDINGS_TTL || '3600000') // 1 hour
        },
        baseService: {
          maxSize: 100,
          ttl: 1800000 // 30 minutes
        }
      },

      // Timeouts
      timeouts: {
        searchDefault: parseInt(process.env.TIMEOUT_SEARCH_DEFAULT || '15000'), // 15 seconds
        embeddingGeneration: parseInt(process.env.TIMEOUT_EMBEDDING || '10000')
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
    
    // Validate scoring weights
    const scoringWeightSum = config.scoring.maxSimilarityWeight + 
                           config.scoring.avgSimilarityWeight;
    if (Math.abs(scoringWeightSum - 1.0) > 0.01) {
      console.warn(`[VectorConfig] Scoring weights sum to ${scoringWeightSum}, should be 1.0`);
    }
    
    // Validate hybrid configuration
    if (config.hybrid.minVectorOnlyThreshold < 0 || config.hybrid.minVectorOnlyThreshold > 1) {
      throw new Error('HYBRID_MIN_VECTOR_ONLY_THRESHOLD must be between 0 and 1');
    }
    
    if (config.hybrid.minVectorWithTextThreshold < 0 || config.hybrid.minVectorWithTextThreshold > 1) {
      throw new Error('HYBRID_MIN_VECTOR_WITH_TEXT_THRESHOLD must be between 0 and 1');
    }
    
    if (config.hybrid.minVectorOnlyThreshold < config.hybrid.minVectorWithTextThreshold) {
      console.warn('[VectorConfig] minVectorOnlyThreshold should be >= minVectorWithTextThreshold for logical consistency');
    }
    
    // Validate positive values
    const positiveValues = [
      'search.defaultLimit', 'search.maxLimit',
      'content.maxExcerptLength', 'content.maxChunksPerDocument',
      'timeouts.searchDefault', 'timeouts.embeddingGeneration',
      'hybrid.confidenceBoost', 'hybrid.confidencePenalty'
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
      console.warn(`[VectorConfig] Unknown cache type '${cacheType}', using searchResults as default`);
      return this.config.cache.searchResults;
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
      hybrid: {
        minVectorOnlyThreshold: this.config.hybrid.minVectorOnlyThreshold,
        minVectorWithTextThreshold: this.config.hybrid.minVectorWithTextThreshold,
        minFinalScore: this.config.hybrid.minFinalScore,
        enableDynamicThresholds: this.config.hybrid.enableDynamicThresholds,
        enableConfidenceWeighting: this.config.hybrid.enableConfidenceWeighting,
        enableQualityGate: this.config.hybrid.enableQualityGate
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