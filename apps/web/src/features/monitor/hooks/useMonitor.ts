import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';

import type { Citation, Source } from '../../../components/common/Citation';
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
      const params = locale ? `?locale=${locale}` : '';
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
      const params = locale ? `?locale=${locale}` : '';
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
      const params = locale ? `?locale=${locale}` : '';
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
      const params = locale ? `?locale=${locale}` : '';
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
      const params = locale ? `?locale=${locale}` : '';
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
}

export function usePolls() {
  return useQuery<PollData>({
    queryKey: ['monitor', 'polls'],
    queryFn: async () => {
      const { data } = await apiClient.get('/monitor/polls');
      return data;
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
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

interface EntitySummaryResult {
  entity: { id: string; label: string };
  count: number;
  summary: string;
  attackAnalysis: string;
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
      const params = locale ? `?locale=${locale}` : '';
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
      const params = locale ? `?locale=${locale}` : '';
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
      const params = locale ? `?locale=${locale}` : '';
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
