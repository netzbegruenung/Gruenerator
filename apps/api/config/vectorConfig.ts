/**
 * Centralized configuration management for vector backend
 * Replaces hardcoded magic numbers and provides environment-based configuration
 */

import { env, type ServerFusion } from './env.js';

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
  /** Master switch des server-seitigen Query-API-Pfads (#3118). */
  serverSideEnabled: boolean;
  /** Welche Fusion dieser Pfad benutzt. */
  serverFusion: ServerFusion;
  /** Limit der Sparse-Vorabholung als Vielfaches der dichten; 0 lässt sie weg. */
  serverSparseFactor: number;
  /** Gewicht der dichten Vorabholung bei `rrf_weighted`. */
  serverRrfWeightDense: number;
  /** Dichten Kosinus und BM25-Wert je Treffer über denselben `queryBatch` zurückholen (#3166). */
  serverScoreJoin: boolean;
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

interface RerankConfig {
  inputLimit: number;
  outputLimit: number;
  minRelevance: number;
  mmrLambda: number;
  mmrKeepTop: number;
  mergeOverfetch: number;
  webScoreCeiling: number;
  /** Same idea as `webScoreCeiling`, for DIP results whose relevance is positional. */
  dipScoreCeiling: number;
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
  rerank: RerankConfig;
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
        defaultThreshold: env.VECTOR_SEARCH_THRESHOLD,
        minThreshold: env.VECTOR_MIN_THRESHOLD,
        maxThreshold: env.VECTOR_MAX_THRESHOLD,
        defaultLimit: env.VECTOR_DEFAULT_LIMIT,
        maxLimit: env.VECTOR_MAX_LIMIT,
        chunkMultiplier: env.VECTOR_CHUNK_MULTIPLIER,
        lengthAdjustments: {
          singleWord: env.VECTOR_SINGLE_WORD_ADJ,
          twoWords: env.VECTOR_TWO_WORDS_ADJ,
          manyWords: env.VECTOR_MANY_WORDS_ADJ,
          manyWordsThreshold: env.VECTOR_MANY_WORDS_THRESHOLD,
        },
      },

      hybrid: {
        minVectorOnlyThreshold: env.HYBRID_MIN_VECTOR_ONLY_THRESHOLD,
        minVectorWithTextThreshold: env.HYBRID_MIN_VECTOR_WITH_TEXT_THRESHOLD,
        minFinalScore: env.HYBRID_MIN_FINAL_SCORE,
        minVectorOnlyFinalScore: env.HYBRID_MIN_VECTOR_ONLY_FINAL_SCORE,
        confidenceBoost: env.HYBRID_CONFIDENCE_BOOST,
        confidencePenalty: env.HYBRID_CONFIDENCE_PENALTY,
        enableDynamicThresholds: env.HYBRID_ENABLE_DYNAMIC_THRESHOLDS,
        enableConfidenceWeighting: env.HYBRID_ENABLE_CONFIDENCE_WEIGHTING,
        enableQualityGate: env.HYBRID_ENABLE_QUALITY_GATE,
        serverSideEnabled: env.HYBRID_SERVER_SIDE_ENABLED,
        serverFusion: env.HYBRID_SERVER_FUSION,
        serverSparseFactor: env.HYBRID_SERVER_SPARSE_FACTOR,
        serverRrfWeightDense: env.HYBRID_SERVER_RRF_WEIGHT_DENSE,
        serverScoreJoin: env.HYBRID_SERVER_SCORE_JOIN,
      },

      scoring: {
        maxSimilarityWeight: env.SCORING_MAX_SIMILARITY_WEIGHT,
        avgSimilarityWeight: env.SCORING_AVG_SIMILARITY_WEIGHT,
        diversityBonusRate: env.SCORING_DIVERSITY_BONUS_RATE,
        maxDiversityBonus: env.SCORING_MAX_DIVERSITY_BONUS,
        maxFinalScore: env.SCORING_MAX_FINAL_SCORE,
      },

      content: {
        maxExcerptLength: env.CONTENT_MAX_EXCERPT_LENGTH,
        excerptSentenceBoundary: env.CONTENT_EXCERPT_SENTENCE_BOUNDARY,
        maxChunksPerDocument: env.CONTENT_MAX_CHUNKS_PER_DOC,
        maxChunksPerDocumentDossier: 10,
        enableFullContentExtraction: true,
      },

      embeddings: {
        maxDimensions: env.EMBEDDING_MAX_DIMENSIONS,
        maxValue: env.EMBEDDING_MAX_VALUE,
        minValue: env.EMBEDDING_MIN_VALUE,
        validationTimeout: env.EMBEDDING_VALIDATION_TIMEOUT,
      },

      cache: {
        searchResults: {
          maxSize: env.CACHE_RESULTS_SIZE,
          ttl: env.CACHE_RESULTS_TTL,
        },
        embeddings: {
          maxSize: env.CACHE_EMBEDDINGS_SIZE,
          ttl: env.CACHE_EMBEDDINGS_TTL,
        },
        baseService: {
          maxSize: 100,
          ttl: 1800000,
        },
      },

      timeouts: {
        searchDefault: env.TIMEOUT_SEARCH_DEFAULT,
        embeddingGeneration: env.TIMEOUT_EMBEDDING,
      },

      validation: {
        maxQueryLength: env.VALIDATION_MAX_QUERY_LENGTH,
        maxUserIdLength: env.VALIDATION_MAX_USER_ID_LENGTH,
        maxDocumentIds: env.VALIDATION_MAX_DOCUMENT_IDS,
        maxDocumentIdLength: env.VALIDATION_MAX_DOCUMENT_ID_LENGTH,
        maxMessageLength: env.VALIDATION_MAX_MESSAGE_LENGTH,
        maxContentTypeLength: env.VALIDATION_MAX_CONTENT_TYPE_LENGTH,
      },

      logging: {
        level: env.LOG_LEVEL,
        enableTelemetry: env.ENABLE_TELEMETRY,
        enableVerbose: env.ENABLE_VERBOSE,
        enableDebug: env.ENABLE_DEBUG,
      },

      performance: {
        maxConcurrentSearches: env.PERF_MAX_CONCURRENT_SEARCHES,
        batchSize: env.PERF_BATCH_SIZE,
        maxRetries: env.PERF_MAX_RETRIES,
        retryDelay: env.PERF_RETRY_DELAY,
      },

      quality: {
        enabled: env.QUALITY_SCORING_ENABLED,
        minChunkQuality: env.QUALITY_MIN_CHUNK,
        weights: {
          readability: env.QUALITY_WEIGHT_READABILITY,
          completeness: env.QUALITY_WEIGHT_COMPLETENESS,
          structure: env.QUALITY_WEIGHT_STRUCTURE,
          density: env.QUALITY_WEIGHT_DENSITY,
        },
        retrieval: {
          enableQualityFilter: env.QUALITY_FILTER_ENABLED,
          minRetrievalQuality: env.QUALITY_MIN_RETRIEVAL,
          qualityBoostFactor: env.QUALITY_BOOST_FACTOR,
        },
      },

      metadata: {
        enrichment: {
          enabled: env.METADATA_ENRICHMENT_ENABLED,
          detectContentTypes: env.METADATA_DETECT_TYPES,
          detectMarkdownStructure: env.METADATA_DETECT_MARKDOWN,
          extractPageNumbers: env.METADATA_EXTRACT_PAGES,
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
          enabled: env.ADAPTIVE_CHUNKING_ENABLED,
          defaultSize: env.CHUNK_DEFAULT_SIZE,
          overlapSize: env.CHUNK_OVERLAP_SIZE,
        },
      },

      retrieval: {
        queryIntent: {
          enabled: env.QUERY_INTENT_ENABLED,
          germanPatterns: env.USE_GERMAN_PATTERNS,
        },
      },

      rerank: {
        inputLimit: env.RERANK_INPUT_LIMIT,
        outputLimit: env.RERANK_OUTPUT_LIMIT,
        minRelevance: env.RERANK_MIN_RELEVANCE,
        mmrLambda: env.RERANK_MMR_LAMBDA,
        mmrKeepTop: env.RERANK_MMR_KEEP_TOP,
        mergeOverfetch: env.RERANK_MERGE_OVERFETCH,
        webScoreCeiling: env.RERANK_WEB_SCORE_CEILING,
        dipScoreCeiling: env.RERANK_DIP_SCORE_CEILING,
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
      const qualityWeightSum = Object.values(config.quality.weights).reduce<number>(
        (sum, weight) => sum + (weight as number),
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

    if (config.rerank.mmrLambda < 0 || config.rerank.mmrLambda > 1) {
      throw new Error('RERANK_MMR_LAMBDA must be between 0 and 1');
    }

    if (config.rerank.mergeOverfetch < config.rerank.outputLimit) {
      console.warn('[VectorConfig] RERANK_MERGE_OVERFETCH should be >= RERANK_OUTPUT_LIMIT');
    }

    if (config.rerank.webScoreCeiling < 0 || config.rerank.webScoreCeiling > 1) {
      throw new Error('RERANK_WEB_SCORE_CEILING must be between 0 and 1');
    }

    if (config.rerank.dipScoreCeiling < 0 || config.rerank.dipScoreCeiling > 1) {
      throw new Error('RERANK_DIP_SCORE_CEILING must be between 0 and 1');
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
        totalMaxSize: Object.values(this.config.cache).reduce<number>(
          (sum, cache) => sum + (cache as CacheEntry).maxSize,
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
export type { FullConfig, SearchConfig, HybridConfig, RerankConfig, CacheConfig, CacheEntry };
