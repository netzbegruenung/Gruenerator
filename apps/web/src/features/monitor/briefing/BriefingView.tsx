import { type MonitorLocale, type MonitorSnapshot } from '@gruenerator/contracts';
import { buildBriefingLead, standLine } from '@gruenerator/shared/monitor';
import { cn } from '@gruenerator/ui';

import {
  BRIEFING_CARDS,
  BriefingRow,
  type BriefingCardId,
  type BriefingCardState,
} from './BriefingCard';
import { BriefingLeadLine } from './BriefingLeadLine';
import { NewsCard } from './NewsCard';
import { KeywordsCard, ThemenCard, XTrendsCard } from './SignalCards';
import { type BriefingNews } from './useBriefingNews';

import { DashboardPage, DASH_PAGE_TITLE } from '@/components/dashboard/DashboardPage';
import { DASH_MUTED } from '@/components/dashboard/dashboardStyles';

const SIGNAL_CARDS: readonly BriefingCardId[] = BRIEFING_CARDS.slice(0, 3);

export interface BriefingViewProps {
  locale: MonitorLocale;
  /** `null`, solange er lädt oder wenn es auf der Instanz noch keinen gibt. */
  snapshot: MonitorSnapshot | null;
  snapshotPending: boolean;
  news: BriefingNews;
  open: BriefingCardId | null;
  onToggle: (card: BriefingCardId) => void;
  onOpen: (card: BriefingCardId) => void;
  /**
   * Hängt `?locale=` an interne Links (`useMonitorLocaleParam`). Als Prop statt als Hook
   * in der Karte, damit der Routen-Fallback ohne Auth-Store auskommt — `routes.ts`
   * importiert `BriefingSkeleton` direkt.
   */
  withLocale: (path: string) => string;
}

/**
 * /briefing ohne Datenabruf: Überschrift, Leitsatz, zwei Reihen Karten, Stand.
 * Die Seite reicht die Daten herein, der Routen-Fallback dieselbe Ansicht im
 * Ladezustand. Entwurf „Puls" (Claude Design, 06.11.2026); er führt Feed,
 * Watcher und Themen & Trends auf einer Seite zusammen.
 */
export function BriefingView({
  locale,
  snapshot,
  snapshotPending,
  news,
  open,
  onToggle,
  onOpen,
  withLocale,
}: BriefingViewProps) {
  const card = (id: BriefingCardId): BriefingCardState => ({
    id,
    open: open === id,
    onToggle: () => onToggle(id),
  });
  // Noch ladend → Platzhalter; geladen, aber ohne Snapshot → leere Karten.
  const pick = <T,>(value: (s: MonitorSnapshot) => T, empty: T): T | null =>
    snapshotPending ? null : snapshot ? value(snapshot) : empty;

  const lead =
    snapshot && !news.greensPending
      ? buildBriefingLead(snapshot.topics, news.greensArticles)
      : null;
  const signalOpen = open !== null && SIGNAL_CARDS.includes(open);

  return (
    <DashboardPage aria-busy={snapshotPending}>
      <h1 className={DASH_PAGE_TITLE}>Briefing</h1>

      <BriefingLeadLine
        lead={lead}
        pending={snapshotPending || news.greensPending}
        onOpen={onOpen}
      />

      <BriefingRow hasOpen={signalOpen}>
        <ThemenCard
          state={card('themen')}
          topics={pick((s) => s.topics, [])}
          withLocale={withLocale}
        />
        <KeywordsCard state={card('keywords')} keywords={pick((s) => s.keywords, [])} />
        <XTrendsCard
          state={card('trends')}
          trends={pick((s) => s.socialTrends, [])}
          keywords={snapshot?.keywords ?? []}
          greensTitles={news.greensArticles.map((a) => a.title)}
          locale={locale}
        />
      </BriefingRow>

      <BriefingRow hasOpen={open !== null && !signalOpen}>
        <NewsCard
          state={card('wichtig')}
          title="Heute wichtig"
          list={news.important}
          emptyText="Gerade keine Meldungen."
        />
        <NewsCard
          state={card('gruene')}
          title="Über die Grünen"
          list={news.greens}
          emptyText="Keine Berichte über die Grünen in den letzten 24 Stunden."
        />
        {news.landesverbaende && (
          <NewsCard
            state={card('landesverbaende')}
            title="Landesverbände"
            list={news.landesverbaende}
            emptyText="Die Landesverbände haben in den letzten sieben Tagen nichts veröffentlicht."
          />
        )}
      </BriefingRow>

      {snapshot && (
        <span className={cn('pt-2 text-[13px]', DASH_MUTED)}>{standLine(snapshot)}</span>
      )}
    </DashboardPage>
  );
}

const PENDING_LIST = { items: [], pending: true };

/** Die ganze Seite im Ladezustand — Routen-Fallback von /briefing. */
export function BriefingSkeleton() {
  const noop = () => {};
  return (
    <BriefingView
      locale="de"
      snapshot={null}
      snapshotPending
      news={{
        important: PENDING_LIST,
        greens: PENDING_LIST,
        greensArticles: [],
        greensPending: true,
        landesverbaende: PENDING_LIST,
      }}
      open={null}
      withLocale={(path) => path}
      onToggle={noop}
      onOpen={noop}
    />
  );
}
