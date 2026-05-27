/**
 * Zod schemas for the Themen-Monitor endpoints.
 * Mirrors apps/api/routes/monitor/monitorContractRouter.ts.
 *
 * Source of truth for the /api/monitor/* request/response shapes. The backend
 * service return types (apps/api/services/monitor/*) and the Drizzle JSONB
 * `$type<>` hints (apps/api/database/schema/monitor.ts) both derive from these,
 * as do the frontend hooks (apps/web/src/features/monitor/hooks/useMonitor.ts).
 */
import { z } from 'zod';

// ── Closed sets ──────────────────────────────────────────────────────────────

/** Audience locale for monitor data. Matches `MonitorLocale` in the API. */
export const monitorLocaleSchema = z.enum(['de', 'at']);
export type MonitorLocale = z.infer<typeof monitorLocaleSchema>;

/** The 13 fixed topic buckets. Matches `TopicCategory` in the API. */
export const topicCategorySchema = z.enum([
  'migration',
  'klima',
  'wirtschaft',
  'soziales',
  'sicherheit',
  'gesundheit',
  'europa',
  'digital',
  'bildung',
  'finanzen',
  'justiz',
  'arbeit',
  'mobilitaet',
]);
export type TopicCategory = z.infer<typeof topicCategorySchema>;

// ── Shared sub-shapes ────────────────────────────────────────────────────────

export const nounCountSchema = z.object({
  noun: z.string(),
  count: z.number(),
});
export type NounCount = z.infer<typeof nounCountSchema>;

/** Per-article emotion intensities; every field is independently optional. */
export const emotionScoresSchema = z.object({
  angst: z.number().optional(),
  wut: z.number().optional(),
  hoffnung: z.number().optional(),
  enttaeuschung: z.number().optional(),
  vertrauen: z.number().optional(),
  solidaritaet: z.number().optional(),
  stolz: z.number().optional(),
});
export type EmotionScores = z.infer<typeof emotionScoresSchema>;

export const monitorArticleSchema = z.object({
  url: z.string(),
  title: z.string(),
  source: z.string(),
  publishedAt: z.string().nullable(),
  excerpt: z.string(),
  locale: monitorLocaleSchema,
  /** Topic relevance scores; only matched topics are present. */
  topics: z.record(topicCategorySchema, z.number()),
  primaryTopic: topicCategorySchema.nullable(),
  topNouns: z.array(nounCountSchema).optional(),
  emotionScores: emotionScoresSchema.optional(),
  erSentiment: z.number().optional(),
});
export type MonitorArticle = z.infer<typeof monitorArticleSchema>;

export const topicScoreSchema = z.object({
  topic: topicCategorySchema,
  score: z.number(),
  articleCount: z.number(),
  topArticles: z.array(monitorArticleSchema),
});
export type TopicScore = z.infer<typeof topicScoreSchema>;

export const monitorKeywordEntrySchema = z.object({
  keyword: z.string(),
  count: z.number(),
  topic: topicCategorySchema.nullable(),
});
export type MonitorKeywordEntry = z.infer<typeof monitorKeywordEntrySchema>;

export const socialTrendSchema = z.object({
  rank: z.number(),
  name: z.string(),
  url: z.string(),
});
export type SocialTrend = z.infer<typeof socialTrendSchema>;

export const monitorSnapshotSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  topics: z.array(topicScoreSchema),
  keywords: z.array(monitorKeywordEntrySchema),
  socialTrends: z.array(socialTrendSchema),
  totalArticles: z.number(),
  sources: z.array(z.string()),
  articlesByLocale: z.object({ de: z.number(), at: z.number() }),
});
export type MonitorSnapshot = z.infer<typeof monitorSnapshotSchema>;

// ── History ──────────────────────────────────────────────────────────────────

export const monitorHistoryEntrySchema = z.object({
  date: z.string(),
  topics: z.array(topicScoreSchema),
});
export type MonitorHistoryEntry = z.infer<typeof monitorHistoryEntrySchema>;

export const monitorHistoryResponseSchema = z.array(monitorHistoryEntrySchema);

// ── Topic drill-down ───────────────────────────────────────────────────────

export const topicArticlesResponseSchema = z.object({
  topic: topicCategorySchema,
  articles: z.array(monitorArticleSchema),
});

// ── Search ─────────────────────────────────────────────────────────────────

export const monitorSearchResponseSchema = z.object({
  query: z.string(),
  count: z.number(),
  sources: z.array(z.string()),
  articles: z.array(monitorArticleSchema),
});

// ── Keyword insights (RAG over party positions) ──────────────────────────────

export const keywordInsightsResponseSchema = z.object({
  text: z.string(),
  dominantTopic: z.string(),
  secondaryTopics: z.array(z.string()),
  citations: z.array(
    z.object({
      index: z.string(),
      cited_text: z.string(),
      document_title: z.string(),
      document_id: z.string(),
      source_url: z.string().nullable(),
      similarity_score: z.number(),
      chunk_index: z.number(),
      collection_id: z.string().optional(),
      collection_name: z.string().optional(),
    })
  ),
  sources: z.array(
    z.object({
      document_id: z.string(),
      document_title: z.string(),
      source_url: z.string().nullable(),
    })
  ),
  confidence: z.string(),
});

// ── AI briefing ──────────────────────────────────────────────────────────────

export const monitorBriefingResponseSchema = z.object({
  briefing: z.string(),
  tweets: z.array(
    z.object({
      text: z.string(),
      topic: z.string(),
      hashtags: z.array(z.string()),
    })
  ),
  generatedAt: z.string(),
  /**
   * Optional citations consumed by MonitorOverview. The current backend does
   * not emit them, but the field is kept so the UI can render them if a future
   * briefing variant attaches grounding.
   */
  citations: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
      })
    )
    .optional(),
});

// ── Polls ──────────────────────────────────────────────────────────────────

export const pollResultSchema = z.object({
  institute: z.string(),
  date: z.string(),
  parties: z.record(z.string(), z.number().nullable()),
});

export const pollDataSchema = z.object({
  polls: z.array(pollResultSchema),
  lastElection: pollResultSchema.nullable(),
  average: z.record(z.string(), z.number()),
  scrapedAt: z.string(),
  // Present only when PolitPro served the data (else the wahlrecht.de fallback).
  source: z.literal('politpro').optional(),
  parliament: z.string().optional(),
  trend: z
    .record(z.string(), z.array(z.object({ date: z.string(), value: z.number() })))
    .optional(),
});

export const pollParliamentSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const pollParliamentsResponseSchema = z.array(pollParliamentSchema);

// ── Meinungsbild (GERDA MRP estimates) ───────────────────────────────────────

export const meinungsbildIssueSchema = z.object({
  id: z.string(),
  label_de: z.string(),
  category: z.string(),
  question_de: z.string(),
  direction: z.string(),
});

export const meinungsbildEstimateSchema = z.object({
  state_code: z.string(),
  state_name: z.string(),
  estimate: z.number(),
  pop: z.number(),
});

export const meinungsbildResponseSchema = z.object({
  issues: z.array(meinungsbildIssueSchema),
  estimates: z.record(z.string(), z.array(meinungsbildEstimateSchema)),
  fetchedAt: z.string(),
});

// ── Stimmung (emotion aggregation) ───────────────────────────────────────────

const stimmungEmotionsSchema = z.record(z.string(), z.number());

export const stimmungResponseSchema = z.object({
  overall: stimmungEmotionsSchema,
  byTopic: z.array(
    z.object({ topic: z.string(), emotions: stimmungEmotionsSchema, articleCount: z.number() })
  ),
  bySource: z.array(
    z.object({ source: z.string(), emotions: stimmungEmotionsSchema, articleCount: z.number() })
  ),
  byKeyword: z.array(
    z.object({ keyword: z.string(), emotions: stimmungEmotionsSchema, articleCount: z.number() })
  ),
  dominantEmotion: z.string().nullable(),
  moodSummary: z.string().optional(),
  moodReason: z.string().optional(),
});

// ── Watcher entities ─────────────────────────────────────────────────────────

export const watcherEntityInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  keywords: z.array(z.string()),
});

export const watcherEntitiesResponseSchema = z.array(watcherEntityInfoSchema);

export const entityResultsResponseSchema = z.object({
  entity: z.object({ id: z.string(), label: z.string() }),
  count: z.number(),
  sources: z.array(z.string()),
  articles: z.array(monitorArticleSchema),
});

export const riskItemSchema = z.object({
  title: z.string(),
  source: z.string(),
  reasoning: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
});

export const entitySummaryResponseSchema = z.object({
  entity: z.object({ id: z.string(), label: z.string() }),
  count: z.number(),
  summary: z.string(),
  attackAnalysis: z.string(),
  riskAnalysis: z
    .object({
      risks: z.array(riskItemSchema),
      opportunities: z.array(riskItemSchema),
    })
    .nullable(),
  generatedAt: z.string(),
});

// ── Refresh (user + internal cron) ───────────────────────────────────────────

export const monitorRefreshResponseSchema = z.object({
  success: z.boolean(),
  totalArticles: z.number(),
  activeTopics: z.number(),
});

export const monitorInstagramRefreshResponseSchema = z.object({
  success: z.boolean(),
  posts: z.number(),
});

// ── Errors ───────────────────────────────────────────────────────────────────

export const monitorErrorResponseSchema = z.object({
  error: z.string(),
});

// ── Query / param schemas ────────────────────────────────────────────────────

export const monitorLocaleQuerySchema = z.object({
  locale: monitorLocaleSchema.optional(),
});

export const monitorHistoryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).optional(),
});

export const topicArticlesQuerySchema = z.object({
  locale: monitorLocaleSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const monitorSearchQuerySchema = z.object({
  q: z.string().min(2),
  locale: monitorLocaleSchema.optional(),
});

export const pollsQuerySchema = z.object({
  parliament: z.string().optional(),
});

// ── Inferred response types (consumed by the frontend hooks) ─────────────────

export type MonitorSearchResult = z.infer<typeof monitorSearchResponseSchema>;
export type KeywordInsightsResult = z.infer<typeof keywordInsightsResponseSchema>;
export type MonitorBriefingResult = z.infer<typeof monitorBriefingResponseSchema>;
export type StimmungResult = z.infer<typeof stimmungResponseSchema>;
export type PollResult = z.infer<typeof pollResultSchema>;
export type PollData = z.infer<typeof pollDataSchema>;
export type PollParliament = z.infer<typeof pollParliamentSchema>;
export type WatcherEntityInfo = z.infer<typeof watcherEntityInfoSchema>;
export type EntityResult = z.infer<typeof entityResultsResponseSchema>;
export type RiskItem = z.infer<typeof riskItemSchema>;
export type EntitySummaryResult = z.infer<typeof entitySummaryResponseSchema>;
export type MeinungsbildIssue = z.infer<typeof meinungsbildIssueSchema>;
export type MeinungsbildEstimate = z.infer<typeof meinungsbildEstimateSchema>;
export type MeinungsbildData = z.infer<typeof meinungsbildResponseSchema>;
