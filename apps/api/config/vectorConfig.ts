/**
 * Centralized configuration management for vector backend
 * Replaces hardcoded magic numbers and provides environment-based configuration
 */

interface LengthAdjustments {
  singleWord: number;
  twoWords: number;
  manyWords: number;
  manyWordsThreshold: number;
}

interface SearchConfig {
  defaultThreshold: number;
  minThreshold: number;
  maxThreshold: number;
  defaultLimit: number;
  maxLimit: number;
  chunkMultiplier: number;
  lengthAdjustments: LengthAdjustments;
}

interface HybridConfig {
  minVectorOnlyThreshold: number;
  minVectorWithTextThreshold: number;
  minFinalScore: number;
  minVectorOnlyFinalScore: number;
  confidenceBoost: number;
  confidencePenalty: number;
  enableDynamicThresholds: boolean;
  enableConfidenceWeighting: boolean;
  enableQualityGate: boolean;
}

interface ScoringConfig {
  maxSimilarityWeight: number;
  avgSimilarityWeight: number;
  diversityBonusRate: number;
  maxDiversityBonus: number;
  maxFinalScore: number;
}

interface ContentConfig {
  maxExcerptLength: number;
  excerptSentenceBoundary: number;
  maxChunksPerDocument: number;
  maxChunksPerDocumentDossier: number;
  enableFullContentExtraction: boolean;
}

interface EmbeddingsConfig {
  maxDimensions: number;
  maxValue: number;
  minValue: number;
  validationTimeout: number;
}

interface CacheEntry {
  maxSize: number;
  ttl: number;
}

interface CacheConfig {
  searchResults: CacheEntry;
  embeddings: CacheEntry;
  baseService: CacheEntry;
}

interface TimeoutsConfig {
  searchDefault: number;
  embeddingGeneration: number;
}

interface ValidationConfig {
  maxQueryLength: number;
  maxUserIdLength: number;
  maxDocumentIds: number;
  maxDocumentIdLength: number;
  maxMessageLength: number;
  maxContentTypeLength: number;
}

interface LoggingConfig {
  level: string;
  enableTelemetry: boolean;
  enableVerbose: boolean;
  enableDebug: boolean;
}

interface PerformanceConfig {
  maxConcurrentSearches: number;
  batchSize: number;
  maxRetries: number;
  retryDelay: number;
}

interface QualityWeights {
  readability: number;
  completeness: number;
  structure: number;
  density: number;
}

interface QualityRetrievalConfig {
  enableQualityFilter: boolean;
  minRetrievalQuality: number;
  qualityBoostFactor: number;
}

interface QualityConfig {
  enabled: boolean;
  minChunkQuality: number;
  weights: QualityWeights;
  retrieval: QualityRetrievalConfig;
}

interface ContentTypeSettings {
  preferredSize: number;
  minQuality: number;
}

interface MetadataConfig {
  enrichment: {
    enabled: boolean;
    detectContentTypes: boolean;
    detectMarkdownStructure: boolean;
    extractPageNumbers: boolean;
  };
  contentTypes: {
    heading: ContentTypeSettings;
    paragraph: ContentTypeSettings;
    list: ContentTypeSettings;
    code: ContentTypeSettings;
    table: ContentTypeSettings;
  };
}

interface ChunkingConfig {
  adaptive: {
    enabled: boolean;
    defaultSize: number;
    overlapSize: number;
  };
}

interface RetrievalConfig {
  queryIntent: {
    enabled: boolean;
    germanPatterns: boolean;
  };
}

interface FullConfig {
  [key: string]: unknown;
  search: SearchConfig;
  hybrid: HybridConfig;
  scoring: ScoringConfig;
  content: ContentConfig;
  embeddings: EmbeddingsConfig;
  cache: CacheConfig;
  timeouts: TimeoutsConfig;
  validation: ValidationConfig;
  logging: LoggingConfig;
  performance: PerformanceConfig;
  quality: QualityConfig;
  metadata: MetadataConfig;
  chunking: ChunkingConfig;
  retrieval: RetrievalConfig;
}

class VectorConfig {
  config: FullConfig;

  constructor() {
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }

  private loadConfiguration(): FullConfig {
    return {
      search: {
        defaultThreshold: parseFloat(process.env.VECTOR_SEARCH_THRESHOLD || '0.3'),
        minThreshold: parseFloat(process.env.VECTOR_MIN_THRESHOLD || '0.2'),
        maxThreshold: parseFloat(process.env.VECTOR_MAX_THRESHOLD || '0.8'),
        defaultLimit: parseInt(process.env.VECTOR_DEFAULT_LIMIT || '5'),
        maxLimit: parseInt(process.env.VECTOR_MAX_LIMIT || '100'),
        chunkMultiplier: parseFloat(process.env.VECTOR_CHUNK_MULTIPLIER || '3.0'),
        lengthAdjustments: {
          singleWord: parseFloat(process.env.VECTOR_SINGLE_WORD_ADJ || '0.0'),
          twoWords: parseFloat(process.env.VECTOR_TWO_WORDS_ADJ || '0.05'),
          manyWords: parseFloat(process.env.VECTOR_MANY_WORDS_ADJ || '-0.1'),
          manyWordsThreshold: parseInt(process.env.VECTOR_MANY_WORDS_THRESHOLD || '5'),
        },
      },

      hybrid: {
        minVectorOnlyThreshold: parseFloat(process.env.HYBRID_MIN_VECTOR_ONLY_THRESHOLD || '0.55'),
        minVectorWithTextThreshold: parseFloat(
          process.env.HYBRID_MIN_VECTOR_WITH_TEXT_THRESHOLD || '0.35'
        ),
        minFinalScore: parseFloat(process.env.HYBRID_MIN_FINAL_SCORE || '0.008'),
        minVectorOnlyFinalScore: parseFloat(
          process.env.HYBRID_MIN_VECTOR_ONLY_FINAL_SCORE || '0.010'
        ),
        confidenceBoost: parseFloat(process.env.HYBRID_CONFIDENCE_BOOST || '1.2'),
        confidencePenalty: parseFloat(process.env.HYBRID_CONFIDENCE_PENALTY || '0.7'),
        enableDynamicThresholds: process.env.HYBRID_ENABLE_DYNAMIC_THRESHOLDS !== 'false',
        enableConfidenceWeighting: process.env.HYBRID_ENABLE_CONFIDENCE_WEIGHTING !== 'false',
        enableQualityGate: process.env.HYBRID_ENABLE_QUALITY_GATE !== 'false',
      },

      scoring: {
        maxSimilarityWeight: parseFloat(process.env.SCORING_MAX_SIMILARITY_WEIGHT || '0.6'),
        avgSimilarityWeight: parseFloat(process.env.SCORING_AVG_SIMILARITY_WEIGHT || '0.4'),
        diversityBonusRate: parseFloat(process.env.SCORING_DIVERSITY_BONUS_RATE || '0.02'),
        maxDiversityBonus: parseFloat(process.env.SCORING_MAX_DIVERSITY_BONUS || '0.1'),
        maxFinalScore: parseFloat(process.env.SCORING_MAX_FINAL_SCORE || '1.0'),
      },

      content: {
        maxExcerptLength: parseInt(process.env.CONTENT_MAX_EXCERPT_LENGTH || '300'),
        excerptSentenceBoundary: parseFloat(process.env.CONTENT_EXCERPT_SENTENCE_BOUNDARY || '0.7'),
        maxChunksPerDocument: parseInt(process.env.CONTENT_MAX_CHUNKS_PER_DOC || '10'),
        maxChunksPerDocumentDossier: 10,
        enableFullContentExtraction: true,
      },

      embeddings: {
        maxDimensions: parseInt(process.env.EMBEDDING_MAX_DIMENSIONS || '10000'),
        maxValue: parseFloat(process.env.EMBEDDING_MAX_VALUE || '100'),
        minValue: parseFloat(process.env.EMBEDDING_MIN_VALUE || '-100'),
        validationTimeout: parseInt(process.env.EMBEDDING_VALIDATION_TIMEOUT || '5000'),
      },

      cache: {
        searchResults: {
          maxSize: parseInt(process.env.CACHE_RESULTS_SIZE || '200'),
          ttl: parseInt(process.env.CACHE_RESULTS_TTL || '900000'),
        },
        embeddings: {
          maxSize: parseInt(process.env.CACHE_EMBEDDINGS_SIZE || '500'),
          ttl: parseInt(process.env.CACHE_EMBEDDINGS_TTL || '3600000'),
        },
        baseService: {
          maxSize: 100,
          ttl: 1800000,
        },
      },

      timeouts: {
        searchDefault: parseInt(process.env.TIMEOUT_SEARCH_DEFAULT || '15000'),
        embeddingGeneration: parseInt(process.env.TIMEOUT_EMBEDDING || '10000'),
      },

      validation: {
        maxQueryLength: parseInt(process.env.VALIDATION_MAX_QUERY_LENGTH || '10000'),
        maxUserIdLength: parseInt(process.env.VALIDATION_MAX_USER_ID_LENGTH || '100'),
        maxDocumentIds: parseInt(process.env.VALIDATION_MAX_DOCUMENT_IDS || '1000'),
        maxDocumentIdLength: parseInt(process.env.VALIDATION_MAX_DOCUMENT_ID_LENGTH || '100'),
        maxMessageLength: parseInt(process.env.VALIDATION_MAX_MESSAGE_LENGTH || '50000'),
        maxContentTypeLength: parseInt(process.env.VALIDATION_MAX_CONTENT_TYPE_LENGTH || '50'),
      },

      logging: {
        level: process.env.LOG_LEVEL || 'info',
        enableTelemetry: process.env.ENABLE_TELEMETRY !== 'false',
        enableVerbose: process.env.ENABLE_VERBOSE === 'true',
        enableDebug: process.env.ENABLE_DEBUG === 'true',
      },

      performance: {
        maxConcurrentSearches: parseInt(process.env.PERF_MAX_CONCURRENT_SEARCHES || '10'),
        batchSize: parseInt(process.env.PERF_BATCH_SIZE || '10'),
        maxRetries: parseInt(process.env.PERF_MAX_RETRIES || '3'),
        retryDelay: parseInt(process.env.PERF_RETRY_DELAY || '1000'),
      },

      quality: {
        enabled: process.env.QUALITY_SCORING_ENABLED !== 'false',
        minChunkQuality: parseFloat(process.env.QUALITY_MIN_CHUNK || '0.3'),
        weights: {
          readability: parseFloat(process.env.QUALITY_WEIGHT_READABILITY || '0.3'),
          completeness: parseFloat(process.env.QUALITY_WEIGHT_COMPLETENESS || '0.25'),
          structure: parseFloat(process.env.QUALITY_WEIGHT_STRUCTURE || '0.25'),
          density: parseFloat(process.env.QUALITY_WEIGHT_DENSITY || '0.2'),
        },
        retrieval: {
          enableQualityFilter: process.env.QUALITY_FILTER_ENABLED !== 'false',
          minRetrievalQuality: parseFloat(process.env.QUALITY_MIN_RETRIEVAL || '0.4'),
          qualityBoostFactor: parseFloat(process.env.QUALITY_BOOST_FACTOR || '1.2'),
        },
      },

      metadata: {
        enrichment: {
          enabled: process.env.METADATA_ENRICHMENT_ENABLED !== 'false',
          detectContentTypes: process.env.METADATA_DETECT_TYPES !== 'false',
          detectMarkdownStructure: process.env.METADATA_DETECT_MARKDOWN !== 'false',
          extractPageNumbers: process.env.METADATA_EXTRACT_PAGES !== 'false',
        },
        contentTypes: {
          heading: { preferredSize: 200, minQuality: 0.5 },
          paragraph: { preferredSize: 400, minQuality: 0.3 },
          list: { preferredSize: 300, minQuality: 0.4 },
          code: { preferredSize: 500, minQuality: 0.5 },
          table: { preferredSize: 600, minQuality: 0.4 },
        },
      },

      chunking: {
        adaptive: {
          enabled: process.env.ADAPTIVE_CHUNKING_ENABLED === 'true',
          defaultSize: parseInt(process.env.CHUNK_DEFAULT_SIZE || '400'),
          overlapSize: parseInt(process.env.CHUNK_OVERLAP_SIZE || '100'),
        },
      },

      retrieval: {
        queryIntent: {
          enabled: process.env.QUERY_INTENT_ENABLED !== 'false',
          germanPatterns: process.env.USE_GERMAN_PATTERNS !== 'false',
        },
      },
    };
  }

  private validateConfiguration(): void {
    const config = this.config;

    if (config.search.defaultThreshold < 0 || config.search.defaultThreshold > 1) {
      throw new Error('VECTOR_SEARCH_THRESHOLD must be between 0 and 1');
    }

    if (config.search.minThreshold >= config.search.maxThreshold) {
      throw new Error('VECTOR_MIN_THRESHOLD must be less than VECTOR_MAX_THRESHOLD');
    }

    const scoringWeightSum =
      config.scoring.maxSimilarityWeight + config.scoring.avgSimilarityWeight;
    if (Math.abs(scoringWeightSum - 1.0) > 0.01) {
      console.warn(`[VectorConfig] Scoring weights sum to ${scoringWeightSum}, should be 1.0`);
    }

    if (config.hybrid.minVectorOnlyThreshold < 0 || config.hybrid.minVectorOnlyThreshold > 1) {
      throw new Error('HYBRID_MIN_VECTOR_ONLY_THRESHOLD must be between 0 and 1');
    }

    if (
      config.hybrid.minVectorWithTextThreshold < 0 ||
      config.hybrid.minVectorWithTextThreshold > 1
    ) {
      throw new Error('HYBRID_MIN_VECTOR_WITH_TEXT_THRESHOLD must be between 0 and 1');
    }

    if (config.hybrid.minVectorOnlyThreshold < config.hybrid.minVectorWithTextThreshold) {
      console.warn(
        '[VectorConfig] minVectorOnlyThreshold should be >= minVectorWithTextThreshold for logical consistency'
      );
    }

    if (config.quality.enabled) {
      const qualityWeightSum = Object.values(config.quality.weights).reduce(
        (sum, weight) => sum + weight,
        0
      );
      if (Math.abs(qualityWeightSum - 1.0) > 0.01) {
        console.warn(`[VectorConfig] Quality weights sum to ${qualityWeightSum}, should be 1.0`);
      }

      if (config.quality.minChunkQuality < 0 || config.quality.minChunkQuality > 1) {
        throw new Error('QUALITY_MIN_CHUNK must be between 0 and 1');
      }

      if (
        config.quality.retrieval.minRetrievalQuality < 0 ||
        config.quality.retrieval.minRetrievalQuality > 1
      ) {
        throw new Error('QUALITY_MIN_RETRIEVAL must be between 0 and 1');
      }
    }

    const positiveValues = [
      'search.defaultLimit',
      'search.maxLimit',
      'content.maxExcerptLength',
      'content.maxChunksPerDocument',
      'timeouts.searchDefault',
      'timeouts.embeddingGeneration',
      'hybrid.confidenceBoost',
      'hybrid.confidencePenalty',
      'quality.retrieval.qualityBoostFactor',
      'chunking.adaptive.defaultSize',
      'chunking.adaptive.overlapSize',
    ];

    positiveValues.forEach((path) => {
      const value = this.getNestedValue(config, path) as number;
      if (value && value <= 0) {
        throw new Error(`Configuration ${path} must be positive, got ${value}`);
      }
    });
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path
      .split('.')
      .reduce((current, key) => (current as Record<string, unknown>)?.[key], obj as unknown);
  }

  get<K extends keyof FullConfig>(section: K): FullConfig[K] {
    if (!this.config[section]) {
      throw new Error(`Configuration section '${section}' not found`);
    }
    return this.config[section];
  }

  getValue(path: string): unknown {
    const value = this.getNestedValue(this.config as Record<string, unknown>, path);
    if (value === undefined) {
      throw new Error(`Configuration value '${path}' not found`);
    }
    return value;
  }

  isDebugMode(): boolean {
    return this.config.logging.enableDebug;
  }

  isVerboseMode(): boolean {
    return this.config.logging.enableVerbose || this.config.logging.enableDebug;
  }

  getCacheConfig(cacheType: keyof CacheConfig): CacheEntry {
    const cacheConfig = this.config.cache[cacheType];
    if (!cacheConfig) {
      console.warn(
        `[VectorConfig] Unknown cache type '${cacheType}', using searchResults as default`
      );
      return this.config.cache.searchResults;
    }
    return cacheConfig;
  }

  getSummary() {
    return {
      search: {
        defaultThreshold: this.config.search.defaultThreshold,
        defaultLimit: this.config.search.defaultLimit,
        maxLimit: this.config.search.maxLimit,
      },
      hybrid: {
        minVectorOnlyThreshold: this.config.hybrid.minVectorOnlyThreshold,
        minVectorWithTextThreshold: this.config.hybrid.minVectorWithTextThreshold,
        minFinalScore: this.config.hybrid.minFinalScore,
        enableDynamicThresholds: this.config.hybrid.enableDynamicThresholds,
        enableConfidenceWeighting: this.config.hybrid.enableConfidenceWeighting,
        enableQualityGate: this.config.hybrid.enableQualityGate,
      },
      cache: {
        totalMaxSize: Object.values(this.config.cache).reduce(
          (sum, cache) => sum + cache.maxSize,
          0
        ),
      },
      timeouts: this.config.timeouts,
      performance: this.config.performance,
      logging: this.config.logging,
    };
  }
}

const vectorConfig = new VectorConfig();

export { vectorConfig, VectorConfig };
export type { FullConfig, SearchConfig, HybridConfig, CacheConfig, CacheEntry };
