import {
  type EntityResult,
  type EntitySummaryResult,
  type EuGreenProfileData,
  type EuGreensData,
  type EuGreensHistoryData,
  type KeywordInsightsResult,
  type MeinungsbildData,
  type MeinungsbildEstimate,
  type MeinungsbildIssue,
  type MonitorArticle,
  type MonitorBriefingResult,
  type MonitorCitation,
  type MonitorHistoryEntry,
  type MonitorLocale,
  type MonitorSearchResult,
  type MonitorSnapshot,
  type PollData,
  type PollParliament,
  type PollsHistoryData,
  type PollsOverviewResponse,
  type StateElectionResult,
  type StateElectionsData,
  type TopicScore,
  type WatcherEntityInfo,
  type WhatHappenedQuery,
  type WhatHappenedResult,
  type WhatHappenedSummaryResult,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { TopicCategory } from '../topicConfig';

/** Build the typed `locale` query object, omitting the key when undefined. */
function localeQuery(locale?: MonitorLocale): { locale?: MonitorLocale } {
  return locale ? { locale } : {};
}

/**
 * Throw an error that still knows its HTTP status.
 *
 * Both the global retry guard (`App.tsx`) and the toast filter (`toastError.ts`)
 * decide on `err.status` — a bare `new Error(...)` leaves that `undefined`, so
 * neither guard fires. That is why a permanent 404 on `/monitor/latest` turned
 * into three requests every five minutes, each with a toast, forever.
 */
function monitorError(res: { status: number }, message: string): Error {
  return Object.assign(new Error(message), { status: res.status });
}

/** Link config for monitor citation renderers (briefing + positions card). */
export const MONITOR_CITATION_LINK_CONFIG = {
  type: 'vectorDocument' as const,
  basePath: '/documents',
  linkKey: 'document_id',
  titleKey: 'document_title',
};

/**
 * Map contract citations to the shape CitationTextRenderer/-SourcesDisplay expect.
 *
 * `document_id`/`chunk_index` werden WEGGELASSEN statt auf `undefined` gesetzt:
 * die Gatter in CitationBadge.tsx:40 und CitationSourcesDisplay.tsx:72 prüfen
 * `chunk_index !== undefined`, und `chunkIndex: 0` muss durchkommen — deshalb
 * `!== undefined` und nicht `!!`.
 *
 * Beide Schlüssel werden nur GEMEINSAM gesetzt: `MONITOR_CITATION_LINK_CONFIG`
 * baut aus `document_id` allein schon einen Dokumentlink (`getDocumentUrl` in
 * citationStore.ts), aber das Modal kann den Kontext nur mit BEIDEN IDs holen
 * — ein Zitat mit `documentId`, aber ohne `chunkIndex` bekäme sonst einen Link
 * auf einen Kontext, der sich nie laden lässt.
 */
export function mapMonitorCitations(citations: MonitorCitation[] | undefined) {
  return (citations ?? []).map((c) => {
    const hasContextKeys = c.documentId !== undefined && c.chunkIndex !== undefined;
    return {
      index: Number(c.id),
      document_title: c.title,
      source_url: c.url,
      cited_text: c.snippet,
      ...(hasContextKeys ? { document_id: c.documentId, chunk_index: c.chunkIndex } : {}),
    };
  });
}

/**
 * The latest snapshot, or `null` when the backend has none yet.
 *
 * 404 here means "no monitor run has happened on this instance", which is a
 * legitimate empty state (a fresh environment, a failed hourly job) and not an
 * error — so consumers render the empty view rather than an error view. Same
 * shape as the notebook/group resolvers (`useNotebookResolver`).
 */
export function useMonitorSnapshot(locale?: MonitorLocale) {
  return useQuery({
    queryKey: ['monitor', 'latest', locale],
    queryFn: async (): Promise<MonitorSnapshot | null> => {
      const res = await getContractsClient().monitor.latest({ query: localeQuery(locale) });
      if (res.status === 200) return res.body;
      if (res.status === 404) return null;
      throw monitorError(res, 'Monitor-Daten konnten nicht geladen werden.');
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
      throw monitorError(res, 'Verlauf konnte nicht geladen werden.');
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
      throw monitorError(res, 'Artikel konnten nicht geladen werden.');
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
      throw monitorError(res, 'Suche fehlgeschlagen.');
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
      throw monitorError(res, 'Keyword-Insights konnten nicht geladen werden.');
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
      throw monitorError(res, 'Briefing konnte nicht geladen werden.');
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

export function usePolls(parliament = 'deutschland') {
  return useQuery({
    queryKey: ['monitor', 'polls', parliament],
    queryFn: async (): Promise<PollData> => {
      const res = await getContractsClient().monitor.polls({ query: { parliament } });
      if (res.status === 200) return res.body;
      throw monitorError(res, 'Umfragedaten konnten nicht geladen werden.');
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

/**
 * Green share per parliament for the choropleth map — ONE request.
 *
 * Replaces a loop of 16 `usePolls` calls, which fanned out to 48 upstream
 * PolitPro requests in under a second and tripped its rate limit.
 */
export function usePollsOverview(country: 'DE' | 'AT' = 'DE', enabled = true) {
  return useQuery({
    queryKey: ['monitor', 'polls', 'overview', country],
    queryFn: async (): Promise<PollsOverviewResponse> => {
      const res = await getContractsClient().monitor.pollsOverview({ query: { country } });
      if (res.status === 200) return res.body;
      throw monitorError(res, 'Umfrageübersicht konnte nicht geladen werden.');
    },
    enabled,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
}

export function useEuGreens() {
  return useQuery({
    queryKey: ['monitor', 'polls', 'eu-greens'],
    queryFn: async (): Promise<EuGreensData> => {
      const res = await getContractsClient().monitor.euGreens();
      if (res.status === 200) return res.body;
      throw monitorError(res, 'EU-Daten konnten nicht geladen werden.');
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 120 * 60 * 1000,
    retry: 1,
  });
}

export function useEuGreensHistory(enabled = true) {
  return useQuery({
    queryKey: ['monitor', 'polls', 'eu-greens-history'],
    queryFn: async (): Promise<EuGreensHistoryData> => {
      const res = await getContractsClient().monitor.euGreensHistory();
      if (res.status === 200) return res.body;
      throw monitorError(res, 'EU-Trenddaten konnten nicht geladen werden.');
    },
    enabled,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 12 * 60 * 60 * 1000,
    retry: 1,
  });
}

export function useEuGreenProfile(countryCode: string | null) {
  return useQuery({
    queryKey: ['monitor', 'eu-green-profile', countryCode],
    queryFn: async (): Promise<EuGreenProfileData> => {
      if (!countryCode) throw new Error('Kein Land ausgewählt.');
      const res = await getContractsClient().monitor.euGreenProfile({
        query: { country: countryCode },
      });
      if (res.status === 200) return res.body;
      throw monitorError(res, 'Partei-Profil konnte nicht geladen werden.');
    },
    enabled: !!countryCode,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 48 * 60 * 60 * 1000,
    retry: 1,
  });
}

export function usePollsHistory(parliament = 'deutschland', enabled = true) {
  return useQuery({
    queryKey: ['monitor', 'polls', 'history', parliament],
    queryFn: async (): Promise<PollsHistoryData> => {
      const res = await getContractsClient().monitor.pollsHistory({ query: { parliament } });
      if (res.status === 200) return res.body;
      throw monitorError(res, 'Trendverlauf konnte nicht geladen werden.');
    },
    enabled,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 12 * 60 * 60 * 1000,
    retry: 1,
  });
}

export function usePollParliaments() {
  return useQuery({
    queryKey: ['monitor', 'polls', 'parliaments'],
    queryFn: async (): Promise<PollParliament[]> => {
      const res = await getContractsClient().monitor.pollParliaments();
      if (res.status === 200) return res.body;
      throw monitorError(res, 'Parlamente konnten nicht geladen werden.');
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
      throw monitorError(res, 'Watcher-Entitäten konnten nicht geladen werden.');
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
      throw monitorError(res, 'Entitäts-Ergebnisse konnten nicht geladen werden.');
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
      throw monitorError(res, 'Zusammenfassung konnte nicht geladen werden.');
    },
    enabled: !!entityId,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

export function useWhatHappened(
  locale?: MonitorLocale,
  opts: Omit<WhatHappenedQuery, 'locale'> = {}
) {
  return useQuery({
    queryKey: ['monitor', 'what-happened', locale, opts],
    queryFn: async (): Promise<WhatHappenedResult> => {
      const res = await getContractsClient().monitor.whatHappened({
        query: { ...opts, ...localeQuery(locale) },
      });
      if (res.status === 200) return res.body;
      throw monitorError(res, 'Neue Inhalte konnten nicht geladen werden.');
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/** Lazy per-day AI digest — only fetched once the user expands the card. */
export function useWhatHappenedSummary(date: string, locale?: MonitorLocale, enabled = false) {
  return useQuery({
    queryKey: ['monitor', 'what-happened-summary', date, locale],
    queryFn: async (): Promise<WhatHappenedSummaryResult> => {
      const res = await getContractsClient().monitor.whatHappenedSummary({
        query: { date, ...localeQuery(locale) },
      });
      if (res.status === 200) return res.body;
      throw monitorError(res, 'Zusammenfassung konnte nicht erstellt werden.');
    },
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
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
      throw monitorError(res, 'Briefing konnte nicht neu generiert werden.');
    },
    onSuccess: () => {
      // Briefing and positions card derive from the same hot-topic analysis —
      // a forced regeneration refreshes both.
      void queryClient.invalidateQueries({ queryKey: ['monitor', 'briefing'] });
      void queryClient.invalidateQueries({ queryKey: ['monitor', 'keyword-insights'] });
    },
  });
}

export function useMonitorRefresh() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await getContractsClient().monitor.refresh();
      if (res.status === 200) return res.body;
      throw monitorError(res, 'Aktualisierung fehlgeschlagen.');
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
      throw monitorError(res, 'Meinungsbild-Daten konnten nicht geladen werden.');
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
      throw monitorError(res, 'Wahlergebnisse konnten nicht geladen werden.');
    },
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 48 * 60 * 60 * 1000,
  });
}

// ─── Research-backed topic documents (research contract) ─────────────────────

const TOPIC_DOCUMENT_COLLECTIONS: Record<MonitorLocale, string[]> = {
  de: ['boell-stiftung-system', 'kommunalwiki-system', 'bundestagsfraktion-system'],
  at: ['oesterreich-gruene-system', 'gruene-at-system'],
};

export function useTopicDocuments(keyword?: string, locale: MonitorLocale = 'de') {
  return useQuery({
    queryKey: ['monitor', 'topic-documents', keyword, locale],
    queryFn: async () => {
      const res = await getContractsClient().research.search({
        body: {
          query: keyword!,
          collectionIds: TOPIC_DOCUMENT_COLLECTIONS[locale],
          limit: 3,
        },
      });
      if (res.status === 200) return res.body.results;
      throw monitorError(res, 'Dokumente konnten nicht geladen werden.');
    },
    enabled: !!keyword && keyword.length >= 2,
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
