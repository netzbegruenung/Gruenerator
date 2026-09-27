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

import { contentSyncSourceSchema } from './contentSync.js';

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

// ── Hot-topic analysis (shared briefing + positions pipeline) ────────────────

export const monitorConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type MonitorConfidence = z.infer<typeof monitorConfidenceSchema>;

export const monitorCitationSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  /**
   * Nur gesetzt, wenn das Zitat auf ein Dokument in der `documents`-Collection
   * zeigt (nicht auf einen Nachrichtenartikel). Zusammen mit `chunkIndex` ist
   * das die Bedingung, unter der CitationBadge.tsx:40 den Kontext-Abruf fährt
   * statt nur `cited_text` zu zeigen. Additiv (F0): der heutige Erzeuger
   * (HotTopicPipeline.ts:282) schickt beides nicht.
   */
  documentId: z.string().optional(),
  /** Index des zitierten Chunks im Dokument; 0 ist gültig. */
  chunkIndex: z.number().int().nonnegative().optional(),
});
export type MonitorCitation = z.infer<typeof monitorCitationSchema>;

export const monitorTweetSchema = z.object({
  text: z.string(),
  topic: z.string(),
  hashtags: z.array(z.string()),
});

/**
 * Combined result of the hot-topic pipeline (one research run feeding the
 * briefing, the tweets and the positions card). This is the redis-cached
 * shape; the briefing and keyword-insights endpoints each return a slice.
 */
export const monitorHotTopicAnalysisSchema = z.object({
  dominantTopic: z.string(),
  secondaryTopics: z.array(z.string()),
  briefing: z.string(),
  tweets: z.array(monitorTweetSchema),
  /** Positions prose with [cite:N] markers for CitationTextRenderer. */
  positionsText: z.string(),
  citations: z.array(monitorCitationSchema),
  confidence: monitorConfidenceSchema,
  generatedAt: z.string(),
  /** Identity of the source snapshot (topic bucket + top article URLs); a cache hit is only valid while it matches. */
  sourceFingerprint: z.string(),
});
export type MonitorHotTopicAnalysis = z.infer<typeof monitorHotTopicAnalysisSchema>;

// ── Keyword insights (positions slice of the hot-topic analysis) ─────────────

export const keywordInsightsResponseSchema = z.object({
  text: z.string(),
  dominantTopic: z.string(),
  secondaryTopics: z.array(z.string()),
  citations: z.array(monitorCitationSchema),
  confidence: monitorConfidenceSchema,
  generatedAt: z.string(),
});

// ── AI briefing (briefing slice of the hot-topic analysis) ───────────────────

export const monitorBriefingResponseSchema = z.object({
  briefing: z.string(),
  tweets: z.array(monitorTweetSchema),
  generatedAt: z.string(),
  // Optional for backward compatibility with cached pre-pipeline responses.
  citations: z.array(monitorCitationSchema).optional(),
});

// ── Polls ──────────────────────────────────────────────────────────────────

export const pollResultSchema = z.object({
  institute: z.string(),
  date: z.string(),
  parties: z.record(z.string(), z.number().nullable()),
  // Present only when the official PolitPro API served the poll.
  sampleSize: z.number().nullable().optional(),
  /** PolitPro institute accuracy score (0–100), when published. */
  instituteScore: z.number().nullable().optional(),
});

export const pollDataSchema = z.object({
  polls: z.array(pollResultSchema),
  lastElection: pollResultSchema.nullable(),
  average: z.record(z.string(), z.number()),
  scrapedAt: z.string(),
  // Optional only for legacy cached payloads — PolitPro is the sole source.
  source: z.literal('politpro').optional(),
  parliament: z.string().optional(),
  trend: z
    .record(z.string(), z.array(z.object({ date: z.string(), value: z.number() })))
    .optional(),
  /** Official week-over-week change per party (official PolitPro API only). */
  diffs: z.record(z.string(), z.number()).optional(),
});

export const pollParliamentSchema = z.object({
  id: z.string(),
  name: z.string(),
  /**
   * Which country's parliament this is. PolitPro covers Austria as fully as
   * Germany (Nationalrat plus all nine Länder); the chat poll lookup needs the
   * split so it can pick a national default per user locale instead of always
   * answering with the Bundestag. Additive — existing clients ignore it.
   */
  country: z.enum(['DE', 'AT']),
});

export const pollParliamentsResponseSchema = z.array(pollParliamentSchema);

/**
 * One map-sized answer per parliament, for the Bundesland choropleth.
 *
 * The map needs two numbers per state, not a full poll record — and asking for
 * the full record 16 times in parallel is what put us ~96× over PolitPro's
 * 30 req/min budget on 20.08.2026. Server-side this is fetched paced; the shape
 * stays deliberately narrow so it remains a single cheap request.
 */
export const pollsOverviewEntrySchema = z.object({
  /** PolitPro parliament id, e.g. 'bayern'. */
  parliament: z.string(),
  /** Green share in the weighted average; null when the parliament has no data. */
  gruene: z.number().nullable(),
  /**
   * End date of the most recent institute poll. Null when only the weighted
   * trend was available — the map then hides the date, matching the
   * `polls.length > 1` rule the per-parliament view already uses.
   */
  latestPollDate: z.string().nullable(),
});

export const pollsOverviewResponseSchema = z.object({
  entries: z.array(pollsOverviewEntrySchema),
  fetchedAt: z.string(),
});

export const pollsOverviewQuerySchema = z.object({
  country: z.enum(['DE', 'AT']).optional(),
});

// ── EU greens (green-party trend across European parliaments) ────────────────

export const euGreenResultSchema = z.object({
  /** PolitPro country code, e.g. 'fi' or 'eu' (EU parliament). */
  countryCode: z.string(),
  countryName: z.string(),
  /** Display label of the green party/alliance, e.g. 'Vihreät'. */
  party: z.string(),
  percent: z.number(),
  /** Official week-over-week change, when published. */
  diff: z.number().nullable(),
  /** Change vs the last election, when published. */
  electionDiff: z.number().nullable(),
  /** Date of the underlying trend data point. */
  date: z.string(),
  /** Caveat, e.g. that the greens run inside a broader alliance. */
  note: z.string().nullable(),
  /**
   * True when `percent` is a broad multi-party alliance total in which the
   * greens are only a minority partner (e.g. FR NFP, ES Sumar). The map renders
   * these hatched and off the green-intensity scale so they aren't read as pure
   * green strength.
   */
  broadAlliance: z.boolean().optional(),
});

export const euGreensResponseSchema = z.object({
  results: z.array(euGreenResultSchema),
  fetchedAt: z.string(),
});

export const pollTrendPointSchema = z.object({
  date: z.string(),
  value: z.number(),
});

/** Weekly green-party trend per country, for the EU comparison chart. */
export const euGreensHistoryResponseSchema = z.object({
  series: z.array(
    z.object({
      countryCode: z.string(),
      countryName: z.string(),
      party: z.string(),
      points: z.array(pollTrendPointSchema),
    })
  ),
  fetchedAt: z.string(),
});

/** AI party profile (Wikipedia summary + links) for one EU green party. */
export const euGreenProfileResponseSchema = z.object({
  countryCode: z.string(),
  countryName: z.string(),
  party: z.string(),
  /** AI summary of the party's Wikipedia article; null if no article exists. */
  summary: z.string().nullable(),
  website: z.string().nullable(),
  wikipediaUrl: z.string().nullable(),
  generatedAt: z.string(),
});

/** Full poll history of one parliament: weekly trend + individual polls. */
export const pollsHistoryResponseSchema = z.object({
  parliament: z.string(),
  /** Weekly trend points per party, ascending by date (since 2019). */
  trend: z.record(z.string(), z.array(pollTrendPointSchema)),
  /** Individual polls of the last ~2 years, ascending by date. */
  polls: z.array(z.object({ date: z.string(), parties: z.record(z.string(), z.number()) })),
  scrapedAt: z.string(),
});

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

// ── State elections (GERDA Landtagswahl results) ─────────────────────────────

export const stateElectionResultSchema = z.object({
  stateCode: z.string(),
  stateName: z.string(),
  politProId: z.string(),
  short: z.string(),
  electionYear: z.number(),
  electionDate: z.string().nullable(),
  turnout: z.number().nullable(),
  // Party display name → vote share (0–1). Includes a "Sonstige" bucket.
  results: z.record(z.string(), z.number()),
});

export const stateElectionsResponseSchema = z.object({
  source: z.string(),
  citation: z.string(),
  electionType: z.string(),
  fetchedAt: z.string(),
  // Keyed by state code "01"–"16".
  states: z.record(z.string(), stateElectionResultSchema),
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

// ── "Was ist passiert" (content-sync article feed) ───────────────────────────

/** Source groups that feed notebook collections; social-media is not recorded. */
export const syncArticleSourceGroupSchema = contentSyncSourceSchema.exclude(['social-media']);
export type SyncArticleSourceGroup = z.infer<typeof syncArticleSourceGroupSchema>;

export const syncArticleEventTypeSchema = z.enum(['stored', 'updated']);
export type SyncArticleEventType = z.infer<typeof syncArticleEventTypeSchema>;

export const whatHappenedArticleSchema = z.object({
  title: z.string(),
  sourceUrl: z.string(),
  sourceGroupId: syncArticleSourceGroupSchema,
  sourceName: z.string(),
  excerpt: z.string().nullable(),
  landesverband: z.string().nullable(),
  collection: z.string(),
  eventType: syncArticleEventTypeSchema,
  publishedAt: z.string().nullable(),
  indexedAt: z.string(),
  syncRunUrl: z.string().nullable(),
});
export type WhatHappenedArticle = z.infer<typeof whatHappenedArticleSchema>;

export const whatHappenedDaySchema = z.object({
  /** ISO date 'YYYY-MM-DD' (UTC). */
  date: z.string(),
  counts: z.object({ stored: z.number(), updated: z.number() }),
  articles: z.array(whatHappenedArticleSchema),
});
export type WhatHappenedDay = z.infer<typeof whatHappenedDaySchema>;

export const whatHappenedResponseSchema = z.object({
  days: z.array(whatHappenedDaySchema),
  totalCount: z.number(),
  /** Distinct values present in the window — feed the expert-mode filters. */
  sourceGroups: z.array(syncArticleSourceGroupSchema),
  landesverbaende: z.array(z.string()),
});
export type WhatHappenedResult = z.infer<typeof whatHappenedResponseSchema>;

/** One recorded sync event, as POSTed by the content-sync run. */
export const syncEventInputSchema = z.object({
  title: z.string().min(1),
  sourceUrl: z.string().min(1),
  sourceGroupId: syncArticleSourceGroupSchema,
  sourceName: z.string().min(1),
  /** First ~300 chars of the article text, for the blog-style feed cards. */
  excerpt: z.string().max(500).nullable(),
  landesverband: z.string().nullable(),
  collection: z.string().min(1),
  eventType: syncArticleEventTypeSchema,
  publishedAt: z.string().nullable(),
  indexedAt: z.string(),
});
export type SyncEventInput = z.infer<typeof syncEventInputSchema>;

export const internalSyncEventsBodySchema = z.object({
  runId: z.string().nullable(),
  runUrl: z.string().nullable(),
  /** Force re-index runs: 'updated' events are dropped server-side. */
  force: z.boolean(),
  events: z.array(syncEventInputSchema).max(2000),
});
export type InternalSyncEventsBody = z.infer<typeof internalSyncEventsBodySchema>;

export const internalSyncEventsResponseSchema = z.object({
  success: z.boolean(),
  received: z.number(),
  upserted: z.number(),
});

/** Lazy per-day AI digest of the sync feed (generated on demand, Redis-cached). */
export const whatHappenedSummaryResponseSchema = z.object({
  /** ISO date 'YYYY-MM-DD' (UTC). */
  date: z.string(),
  /** Markdown with deterministic source links. */
  summary: z.string(),
  articleCount: z.number(),
  generatedAt: z.string(),
});
export type WhatHappenedSummaryResult = z.infer<typeof whatHappenedSummaryResponseSchema>;

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

export const euGreenProfileQuerySchema = z.object({
  country: z.string(),
});

export const whatHappenedQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).optional(),
  locale: monitorLocaleSchema.optional(),
  sourceGroup: syncArticleSourceGroupSchema.optional(),
  landesverband: z.string().optional(),
  eventType: syncArticleEventTypeSchema.optional(),
});
export type WhatHappenedQuery = z.infer<typeof whatHappenedQuerySchema>;

export const whatHappenedSummaryQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  locale: monitorLocaleSchema.optional(),
});

// ── Inferred response types (consumed by the frontend hooks) ─────────────────

export type MonitorSearchResult = z.infer<typeof monitorSearchResponseSchema>;
export type KeywordInsightsResult = z.infer<typeof keywordInsightsResponseSchema>;
export type MonitorBriefingResult = z.infer<typeof monitorBriefingResponseSchema>;
export type PollResult = z.infer<typeof pollResultSchema>;
export type PollData = z.infer<typeof pollDataSchema>;
export type PollParliament = z.infer<typeof pollParliamentSchema>;
export type PollsOverviewEntry = z.infer<typeof pollsOverviewEntrySchema>;
export type PollsOverviewResponse = z.infer<typeof pollsOverviewResponseSchema>;
export type EuGreenResult = z.infer<typeof euGreenResultSchema>;
export type EuGreensData = z.infer<typeof euGreensResponseSchema>;
export type EuGreensHistoryData = z.infer<typeof euGreensHistoryResponseSchema>;
export type EuGreenProfileData = z.infer<typeof euGreenProfileResponseSchema>;
export type PollsHistoryData = z.infer<typeof pollsHistoryResponseSchema>;
export type PollTrendPoint = z.infer<typeof pollTrendPointSchema>;
export type WatcherEntityInfo = z.infer<typeof watcherEntityInfoSchema>;
export type EntityResult = z.infer<typeof entityResultsResponseSchema>;
export type RiskItem = z.infer<typeof riskItemSchema>;
export type EntitySummaryResult = z.infer<typeof entitySummaryResponseSchema>;
export type MeinungsbildIssue = z.infer<typeof meinungsbildIssueSchema>;
export type MeinungsbildEstimate = z.infer<typeof meinungsbildEstimateSchema>;
export type MeinungsbildData = z.infer<typeof meinungsbildResponseSchema>;
export type StateElectionResult = z.infer<typeof stateElectionResultSchema>;
export type StateElectionsData = z.infer<typeof stateElectionsResponseSchema>;
