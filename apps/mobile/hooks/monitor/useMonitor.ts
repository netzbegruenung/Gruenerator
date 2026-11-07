import {
  type EntityResult,
  type EuGreensData,
  type KeywordArticlesResult,
  type MonitorLocale,
  type MonitorSnapshot,
  type PollData,
  type PollsOverviewResponse,
  type WhatHappenedResult,
} from '@gruenerator/contracts';
import { apiErrorFromResponse, getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

// Dieselben Abfragen, Query-Keys und `staleTime`-Werte wie die Web-Hooks in
// `apps/web/src/features/monitor/hooks/useMonitor.ts`, aber ohne Speichern auf dem
// Gerät: ein Kaltstart zeigt kurz die Platzhalter. `refetchOnWindowFocus` ist hier
// an (in der App sonst global aus): beim Zurückkehren in die App lädt nach, was seine
// `staleTime` überschritten hat.

function localeQuery(locale: MonitorLocale): { locale: MonitorLocale } {
  return { locale };
}

/** Der jüngste Snapshot, oder `null`, wenn das Backend noch keinen hat (404). */
export function useMonitorSnapshot(locale: MonitorLocale) {
  return useQuery({
    queryKey: ['monitor', 'latest', locale],
    queryFn: async (): Promise<MonitorSnapshot | null> => {
      const res = await getContractsClient().monitor.latest({ query: localeQuery(locale) });
      if (res.status === 200) return res.body;
      if (res.status === 404) return null;
      throw apiErrorFromResponse(res, 'Monitor-Daten konnten nicht geladen werden.');
    },
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/** Neue Beiträge der Landesverbände, `days` Tage zurück. */
export function useWhatHappened(locale: MonitorLocale, opts: { days: number }) {
  return useQuery({
    queryKey: ['monitor', 'what-happened', locale, opts],
    queryFn: async (): Promise<WhatHappenedResult> => {
      const res = await getContractsClient().monitor.whatHappened({
        query: { ...opts, ...localeQuery(locale) },
      });
      if (res.status === 200) return res.body;
      throw apiErrorFromResponse(res, 'Neue Inhalte konnten nicht geladen werden.');
    },
    refetchOnWindowFocus: true,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/** Watcher-Treffer einer Entität, etwa `gruene` oder `gruene-at`. */
export function useEntityResults(entityId: string, locale: MonitorLocale) {
  return useQuery({
    queryKey: ['monitor', 'entity', entityId, locale],
    queryFn: async (): Promise<EntityResult> => {
      const res = await getContractsClient().monitor.entityResults({
        params: { id: entityId },
        query: localeQuery(locale),
      });
      if (res.status === 200) return res.body;
      throw apiErrorFromResponse(res, 'Entitäts-Ergebnisse konnten nicht geladen werden.');
    },
    refetchOnWindowFocus: true,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useKeywordArticles(locale: MonitorLocale) {
  return useQuery({
    queryKey: ['monitor', 'keyword-articles', locale],
    queryFn: async (): Promise<KeywordArticlesResult> => {
      const res = await getContractsClient().monitor.keywordArticles({
        query: localeQuery(locale),
      });
      if (res.status === 200) return res.body;
      throw apiErrorFromResponse(res, 'Artikel konnten nicht geladen werden.');
    },
    refetchOnWindowFocus: true,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function usePolls(parliament: string) {
  return useQuery({
    queryKey: ['monitor', 'polls', parliament],
    queryFn: async (): Promise<PollData> => {
      const res = await getContractsClient().monitor.polls({ query: { parliament } });
      if (res.status === 200) return res.body;
      throw apiErrorFromResponse(res, 'Umfragedaten konnten nicht geladen werden.');
    },
    refetchOnWindowFocus: true,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

/** Grünen-Anteil je Parlament für die Karte — eine Abfrage statt sechzehn. */
export function usePollsOverview(country: 'DE' | 'AT') {
  return useQuery({
    queryKey: ['monitor', 'polls', 'overview', country],
    queryFn: async (): Promise<PollsOverviewResponse> => {
      const res = await getContractsClient().monitor.pollsOverview({ query: { country } });
      if (res.status === 200) return res.body;
      throw apiErrorFromResponse(res, 'Umfrageübersicht konnte nicht geladen werden.');
    },
    refetchOnWindowFocus: true,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 12 * 60 * 60 * 1000,
    retry: 1,
  });
}

export function useEuGreens() {
  return useQuery({
    queryKey: ['monitor', 'polls', 'eu-greens'],
    queryFn: async (): Promise<EuGreensData> => {
      const res = await getContractsClient().monitor.euGreens();
      if (res.status === 200) return res.body;
      throw apiErrorFromResponse(res, 'EU-Daten konnten nicht geladen werden.');
    },
    refetchOnWindowFocus: true,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 12 * 60 * 60 * 1000,
    retry: 1,
  });
}
