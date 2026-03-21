import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';

import type { Citation, Source } from '../../../components/common/Citation';

function localeQuery(locale?: MonitorLocale): string {
  return locale ? `?locale=${locale}` : '';
}
import type { TopicCategory } from '../topicConfig';

export type MonitorLocale = 'de' | 'at';

interface MonitorArticle {
  url: string;
  title: string;
  source: string;
  publishedAt: string | null;
  excerpt: string;
  locale: MonitorLocale;
  topics: Partial<Record<TopicCategory, number>>;
  primaryTopic: TopicCategory | null;
  erSentiment?: number;
}

interface TopicScore {
  topic: TopicCategory;
  score: number;
  articleCount: number;
  topArticles: MonitorArticle[];
}

interface KeywordEntry {
  keyword: string;
  count: number;
  topic: TopicCategory | null;
}

interface SocialTrend {
  rank: number;
  name: string;
  url: string;
}

interface MonitorSnapshot {
  id: string;
  createdAt: string;
  topics: TopicScore[];
  keywords?: KeywordEntry[];
  socialTrends?: SocialTrend[];
  totalArticles: number;
  sources: string[];
  articlesByLocale: { de: number; at: number };
}

interface HistoryEntry {
  date: string;
  topics: TopicScore[];
}

export function useMonitorSnapshot(locale?: MonitorLocale) {
  return useQuery<MonitorSnapshot>({
    queryKey: ['monitor', 'latest', locale],
    queryFn: async () => {
      const params = localeQuery(locale);
      const { data } = await apiClient.get(`/monitor/latest${params}`);
      return data;
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useMonitorHistory(days = 7) {
  return useQuery<HistoryEntry[]>({
    queryKey: ['monitor', 'history', days],
    queryFn: async () => {
      const { data } = await apiClient.get(`/monitor/history?days=${days}`);
      return data;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useTopicArticles(topic: TopicCategory | null, locale?: MonitorLocale) {
  return useQuery<{ topic: string; articles: MonitorArticle[] }>({
    queryKey: ['monitor', 'topic', topic, locale],
    queryFn: async () => {
      const params = localeQuery(locale);
      const { data } = await apiClient.get(`/monitor/topic/${topic}${params}`);
      return data;
    },
    enabled: !!topic,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

interface SearchResult {
  query: string;
  count: number;
  sources: string[];
  articles: MonitorArticle[];
}

export function useMonitorSearch(query: string, locale?: MonitorLocale) {
  return useQuery<SearchResult>({
    queryKey: ['monitor', 'search', query, locale],
    queryFn: async () => {
      const params = new URLSearchParams({ q: query });
      if (locale) params.set('locale', locale);
      const { data } = await apiClient.get(`/monitor/search?${params}`);
      return data;
    },
    enabled: query.length >= 2,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

interface KeywordInsightsResult {
  text: string;
  citations: Citation[];
  sources: Source[];
}

export function useKeywordInsights(locale?: MonitorLocale) {
  return useQuery<KeywordInsightsResult>({
    queryKey: ['monitor', 'keyword-insights', locale],
    queryFn: async () => {
      const params = localeQuery(locale);
      const { data } = await apiClient.get(`/monitor/keyword-insights${params}`);
      return data;
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

interface MonitorBriefingResult {
  briefing: string;
  tweets: Array<{ text: string; topic: string; hashtags: string[] }>;
  generatedAt: string;
}

export function useMonitorBriefing(locale?: MonitorLocale) {
  return useQuery<MonitorBriefingResult>({
    queryKey: ['monitor', 'briefing', locale],
    queryFn: async () => {
      const params = localeQuery(locale);
      const { data } = await apiClient.get(`/monitor/briefing${params}`);
      return data;
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

interface StimmungResult {
  overall: Record<string, number>;
  byTopic: Array<{ topic: string; emotions: Record<string, number>; articleCount: number }>;
  bySource: Array<{ source: string; emotions: Record<string, number>; articleCount: number }>;
  byKeyword: Array<{ keyword: string; emotions: Record<string, number>; articleCount: number }>;
  moodSummary?: string;
  moodReason?: string;
  dominantEmotion: string | null;
}

export function useStimmung(locale?: MonitorLocale) {
  return useQuery<StimmungResult>({
    queryKey: ['monitor', 'stimmung', locale],
    queryFn: async () => {
      const params = localeQuery(locale);
      const { data } = await apiClient.get(`/monitor/stimmung${params}`);
      return data;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

interface PollResult {
  institute: string;
  date: string;
  parties: Record<string, number | null>;
}

interface PollData {
  polls: PollResult[];
  lastElection: PollResult | null;
  average: Record<string, number>;
  scrapedAt: string;
  source?: 'politpro';
  parliament?: string;
  trend?: Record<string, Array<{ date: string; value: number }>>;
}

export interface PollParliament {
  id: string;
  name: string;
}

export function usePolls(parliament = 'deutschland') {
  return useQuery<PollData>({
    queryKey: ['monitor', 'polls', parliament],
    queryFn: async () => {
      const { data } = await apiClient.get(`/monitor/polls?parliament=${parliament}`);
      return data;
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

export function usePollParliaments() {
  return useQuery<PollParliament[]>({
    queryKey: ['monitor', 'polls', 'parliaments'],
    queryFn: async () => {
      const { data } = await apiClient.get('/monitor/polls/parliaments');
      return data;
    },
    staleTime: 60 * 60 * 1000,
  });
}

interface WatcherEntityInfo {
  id: string;
  label: string;
  keywords: string[];
}

interface EntityResult {
  entity: { id: string; label: string };
  count: number;
  sources: string[];
  articles: MonitorArticle[];
}

interface RiskItem {
  title: string;
  source: string;
  reasoning: string;
  severity: 'high' | 'medium' | 'low';
}

interface EntitySummaryResult {
  entity: { id: string; label: string };
  count: number;
  summary: string;
  attackAnalysis: string;
  riskAnalysis?: { risks: RiskItem[]; opportunities: RiskItem[] } | null;
  generatedAt: string;
}

export function useWatcherEntities() {
  return useQuery<WatcherEntityInfo[]>({
    queryKey: ['monitor', 'entities'],
    queryFn: async () => {
      const { data } = await apiClient.get('/monitor/entities');
      return data;
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 120 * 60 * 1000,
  });
}

export function useEntityResults(entityId: string | null, locale?: MonitorLocale) {
  return useQuery<EntityResult>({
    queryKey: ['monitor', 'entity', entityId, locale],
    queryFn: async () => {
      const params = localeQuery(locale);
      const { data } = await apiClient.get(`/monitor/entities/${entityId}${params}`);
      return data;
    },
    enabled: !!entityId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useEntitySummary(entityId: string | null, locale?: MonitorLocale) {
  return useQuery<EntitySummaryResult>({
    queryKey: ['monitor', 'entity-summary', entityId, locale],
    queryFn: async () => {
      const params = localeQuery(locale);
      const { data } = await apiClient.get(`/monitor/entities/${entityId}/summary${params}`);
      return data;
    },
    enabled: !!entityId,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

export function useBriefingRefresh(locale?: MonitorLocale) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const params = localeQuery(locale);
      const { data } = await apiClient.post(`/monitor/briefing/refresh${params}`);
      return data as MonitorBriefingResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitor', 'briefing'] });
    },
  });
}

export function useMonitorRefresh() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post('/monitor/refresh');
      return data as { success: boolean; totalArticles: number; activeTopics: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitor'] });
    },
  });
}

interface TopicPositionResult {
  document_title: string;
  source_url: string;
  relevant_content: string;
  similarity_score: number;
  collection_name: string;
}

export function useTopicPosition(keyword?: string) {
  return useQuery<TopicPositionResult | null>({
    queryKey: ['monitor', 'position', keyword],
    queryFn: async () => {
      const { data } = await apiClient.post('/research/search', {
        query: keyword,
        collectionIds: ['grundsatz-system', 'bundestagsfraktion-system'],
        limit: 1,
      });
      return data.results?.[0] ?? null;
    },
    enabled: !!keyword,
    staleTime: 30 * 60 * 1000,
  });
}

const TOPIC_DOCUMENT_COLLECTIONS: Record<MonitorLocale, string[]> = {
  de: ['boell-stiftung-system', 'kommunalwiki-system', 'bundestagsfraktion-system'],
  at: ['oesterreich-gruene-system', 'gruene-at-system'],
};

export function useTopicDocuments(keyword?: string, locale: MonitorLocale = 'de') {
  return useQuery<TopicPositionResult[]>({
    queryKey: ['monitor', 'topic-documents', keyword, locale],
    queryFn: async () => {
      const { data } = await apiClient.post('/research/search', {
        query: keyword,
        collectionIds: TOPIC_DOCUMENT_COLLECTIONS[locale],
        limit: 3,
      });
      return data.results ?? [];
    },
    enabled: !!keyword,
    staleTime: 30 * 60 * 1000,
  });
}

export type {
  MonitorSnapshot,
  TopicScore,
  MonitorArticle,
  HistoryEntry,
  SearchResult,
  WatcherEntityInfo,
  EntityResult,
  EntitySummaryResult,
};
