import {
  type EntityResult,
  type EntitySummaryResult,
  type KeywordInsightsResult,
  type MeinungsbildData,
  type MeinungsbildEstimate,
  type MeinungsbildIssue,
  type MonitorArticle,
  type MonitorBriefingResult,
  type MonitorHistoryEntry,
  type MonitorLocale,
  type MonitorSearchResult,
  type MonitorSnapshot,
  type PollData,
  type PollParliament,
  type StateElectionResult,
  type StateElectionsData,
  type StimmungResult,
  type TopicScore,
  type WatcherEntityInfo,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';

import type { TopicCategory } from '../topicConfig';

/** Build the typed `locale` query object, omitting the key when undefined. */
function localeQuery(locale?: MonitorLocale): { locale?: MonitorLocale } {
  return locale ? { locale } : {};
}

export function useMonitorSnapshot(locale?: MonitorLocale) {
  return useQuery({
    queryKey: ['monitor', 'latest', locale],
    queryFn: async (): Promise<MonitorSnapshot> => {
      const res = await getContractsClient().monitor.latest({ query: localeQuery(locale) });
      if (res.status === 200) return res.body;
      throw new Error('Monitor-Daten konnten nicht geladen werden.');
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useMonitorHistory(days = 7) {
  return useQuery({
    queryKey: ['monitor', 'history', days],
    queryFn: async (): Promise<MonitorHistoryEntry[]> => {
      const res = await getContractsClient().monitor.history({ query: { days } });
      if (res.status === 200) return res.body;
      throw new Error('Verlauf konnte nicht geladen werden.');
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useTopicArticles(topic: TopicCategory | null, locale?: MonitorLocale) {
  return useQuery({
    queryKey: ['monitor', 'topic', topic, locale],
    queryFn: async () => {
      if (!topic) throw new Error('Kein Thema ausgewählt.');
      const res = await getContractsClient().monitor.topicArticles({
        params: { topic },
        query: localeQuery(locale),
      });
      if (res.status === 200) return res.body;
      throw new Error('Artikel konnten nicht geladen werden.');
    },
    enabled: !!topic,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useMonitorSearch(query: string, locale?: MonitorLocale) {
  return useQuery({
    queryKey: ['monitor', 'search', query, locale],
    queryFn: async (): Promise<MonitorSearchResult> => {
      const res = await getContractsClient().monitor.search({
        query: { q: query, ...localeQuery(locale) },
      });
      if (res.status === 200) return res.body;
      throw new Error('Suche fehlgeschlagen.');
    },
    enabled: query.length >= 2,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useKeywordInsights(locale?: MonitorLocale) {
  return useQuery({
    queryKey: ['monitor', 'keyword-insights', locale],
    queryFn: async (): Promise<KeywordInsightsResult> => {
      const res = await getContractsClient().monitor.keywordInsights({
        query: localeQuery(locale),
      });
      if (res.status === 200) return res.body;
      throw new Error('Keyword-Insights konnten nicht geladen werden.');
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

export function useMonitorBriefing(locale?: MonitorLocale) {
  return useQuery({
    queryKey: ['monitor', 'briefing', locale],
    queryFn: async (): Promise<MonitorBriefingResult> => {
      const res = await getContractsClient().monitor.briefing({ query: localeQuery(locale) });
      if (res.status === 200) return res.body;
      throw new Error('Briefing konnte nicht geladen werden.');
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

export function useStimmung(locale?: MonitorLocale) {
  return useQuery({
    queryKey: ['monitor', 'stimmung', locale],
    queryFn: async (): Promise<StimmungResult> => {
      const res = await getContractsClient().monitor.stimmung({ query: localeQuery(locale) });
      if (res.status === 200) return res.body;
      throw new Error('Stimmung konnte nicht geladen werden.');
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function usePolls(parliament = 'deutschland') {
  return useQuery({
    queryKey: ['monitor', 'polls', parliament],
    queryFn: async (): Promise<PollData> => {
      const res = await getContractsClient().monitor.polls({ query: { parliament } });
      if (res.status === 200) return res.body;
      throw new Error('Umfragedaten konnten nicht geladen werden.');
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

export function usePollParliaments() {
  return useQuery({
    queryKey: ['monitor', 'polls', 'parliaments'],
    queryFn: async (): Promise<PollParliament[]> => {
      const res = await getContractsClient().monitor.pollParliaments();
      if (res.status === 200) return res.body;
      throw new Error('Parlamente konnten nicht geladen werden.');
    },
    staleTime: 60 * 60 * 1000,
  });
}

export function useWatcherEntities() {
  return useQuery({
    queryKey: ['monitor', 'entities'],
    queryFn: async (): Promise<WatcherEntityInfo[]> => {
      const res = await getContractsClient().monitor.entities();
      if (res.status === 200) return res.body;
      throw new Error('Watcher-Entitäten konnten nicht geladen werden.');
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 120 * 60 * 1000,
  });
}

export function useEntityResults(entityId: string | null, locale?: MonitorLocale) {
  return useQuery({
    queryKey: ['monitor', 'entity', entityId, locale],
    queryFn: async (): Promise<EntityResult> => {
      if (!entityId) throw new Error('Keine Entität ausgewählt.');
      const res = await getContractsClient().monitor.entityResults({
        params: { id: entityId },
        query: localeQuery(locale),
      });
      if (res.status === 200) return res.body;
      throw new Error('Entitäts-Ergebnisse konnten nicht geladen werden.');
    },
    enabled: !!entityId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useEntitySummary(entityId: string | null, locale?: MonitorLocale) {
  return useQuery({
    queryKey: ['monitor', 'entity-summary', entityId, locale],
    queryFn: async (): Promise<EntitySummaryResult> => {
      if (!entityId) throw new Error('Keine Entität ausgewählt.');
      const res = await getContractsClient().monitor.entitySummary({
        params: { id: entityId },
        query: localeQuery(locale),
      });
      if (res.status === 200) return res.body;
      throw new Error('Zusammenfassung konnte nicht geladen werden.');
    },
    enabled: !!entityId,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

export function useBriefingRefresh(locale?: MonitorLocale) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<MonitorBriefingResult> => {
      const res = await getContractsClient().monitor.refreshBriefing({
        query: localeQuery(locale),
      });
      if (res.status === 200) return res.body;
      throw new Error('Briefing konnte nicht neu generiert werden.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['monitor', 'briefing'] });
    },
  });
}

export function useMonitorRefresh() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await getContractsClient().monitor.refresh();
      if (res.status === 200) return res.body;
      throw new Error('Aktualisierung fehlgeschlagen.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['monitor'] });
    },
  });
}

export function useMeinungsbild() {
  return useQuery({
    queryKey: ['monitor', 'meinungsbild'],
    queryFn: async (): Promise<MeinungsbildData> => {
      const res = await getContractsClient().monitor.meinungsbild();
      if (res.status === 200) return res.body;
      throw new Error('Meinungsbild-Daten konnten nicht geladen werden.');
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 120 * 60 * 1000,
  });
}

export function useStateElections() {
  return useQuery({
    queryKey: ['monitor', 'elections'],
    queryFn: async (): Promise<StateElectionsData> => {
      const res = await getContractsClient().monitor.elections();
      if (res.status === 200) return res.body;
      throw new Error('Wahlergebnisse konnten nicht geladen werden.');
    },
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 48 * 60 * 60 * 1000,
  });
}

// ─── Research-backed topic positions (not part of the monitor contract) ──────

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
      const { data } = await apiClient.post<{ results?: TopicPositionResult[] }>(
        '/research/search',
        {
          query: keyword,
          collectionIds: ['grundsatz-system', 'bundestagsfraktion-system'],
          limit: 1,
        }
      );
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
      const { data } = await apiClient.post<{ results?: TopicPositionResult[] }>(
        '/research/search',
        {
          query: keyword,
          collectionIds: TOPIC_DOCUMENT_COLLECTIONS[locale],
          limit: 3,
        }
      );
      return data.results ?? [];
    },
    enabled: !!keyword,
    staleTime: 30 * 60 * 1000,
  });
}

// Re-exported for the monitor components (shapes now derive from the contract).
export type {
  EntityResult,
  EntitySummaryResult,
  MeinungsbildData,
  MeinungsbildData as MeinungsbildDataType,
  MeinungsbildEstimate,
  MeinungsbildIssue,
  MonitorArticle,
  MonitorHistoryEntry as HistoryEntry,
  MonitorLocale,
  MonitorSearchResult as SearchResult,
  PollParliament,
  StateElectionResult,
  StateElectionsData,
  TopicScore,
  MonitorSnapshot,
  WatcherEntityInfo,
};
