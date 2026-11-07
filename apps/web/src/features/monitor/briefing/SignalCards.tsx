import {
  type MonitorKeywordEntry,
  type MonitorLocale,
  type SocialTrend,
  type TopicScore,
} from '@gruenerator/contracts';
import { keywordStyles, trendInTheNews } from '@gruenerator/shared/monitor';
import { cn } from '@gruenerator/ui';
import { Link } from 'react-router-dom';

import { TOPIC_CONFIG } from '../topicConfig';

import { BriefingCard, type BriefingCardState } from './BriefingCard';

import { Bone } from '@/components/dashboard/Bone';
import { DASH_DISPLAY, DASH_FOCUS, DASH_MUTED } from '@/components/dashboard/dashboardStyles';

// Die drei Signal-Karten der oberen Reihe: Themen, Keywords, X-Trends. Alle
// lesen aus dem Monitor-Snapshot; `null` heißt: der Snapshot lädt noch.

// inline-block + py/-my: 24 px hohe Zielfläche (WCAG 2.5.8), ohne die Zeile zu verschieben.
const INLINE_LINK = cn(
  'inline-block rounded-sm py-0.5 -my-0.5 text-inherit no-underline hover:underline',
  DASH_FOCUS
);

/** Themen nach Artikelanzahl, mit grauen Balken; eingeklappt fünf, offen alle. */
export function ThemenCard({
  state,
  topics,
  withLocale,
}: {
  state: BriefingCardState;
  topics: TopicScore[] | null;
  withLocale: (path: string) => string;
}) {
  const sorted = [...(topics ?? [])].sort((a, b) => b.articleCount - a.articleCount);
  const shown = state.open ? sorted : sorted.slice(0, 5);
  const max = sorted[0]?.articleCount || 1;

  return (
    <BriefingCard state={state} title="Themen" busy={topics === null}>
      {topics === null ? (
        <RowsSkeleton />
      ) : shown.length === 0 ? (
        <p className={cn('m-0 text-[15px]', DASH_MUTED)}>Gerade keine Themen.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {shown.map((t) => (
            <li
              key={t.topic}
              className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] items-center gap-3"
            >
              <Link
                to={withLocale(`/themen/${t.topic}`)}
                className={cn('text-[15px] text-foreground hover:text-(--dash-mg)', INLINE_LINK)}
              >
                {TOPIC_CONFIG[t.topic].name}
                <span className="sr-only">, {t.articleCount} Artikel</span>
              </Link>
              <span aria-hidden className="h-1.5 rounded-full bg-border">
                <span
                  className="block h-full rounded-full bg-muted-foreground"
                  style={{ width: `${Math.round((t.articleCount / max) * 100)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </BriefingCard>
  );
}

const TONE = {
  accent: 'text-(--dash-mg)',
  strong: 'text-foreground',
  muted: 'text-muted-foreground',
} as const;

/** Die häufigsten Begriffe als Wolke, Größe nach Rang; eingeklappt zwölf, offen dreißig. */
export function KeywordsCard({
  state,
  keywords,
}: {
  state: BriefingCardState;
  keywords: MonitorKeywordEntry[] | null;
}) {
  const sorted = [...(keywords ?? [])].sort((a, b) => b.count - a.count);
  const shown = sorted.slice(0, state.open ? 30 : 12);
  const styles = keywordStyles(shown.length, 40, state.open ? 15 : 17);

  return (
    <BriefingCard state={state} title="Keywords" busy={keywords === null}>
      {keywords === null ? (
        <CloudSkeleton />
      ) : shown.length === 0 ? (
        <p className={cn('m-0 text-[15px]', DASH_MUTED)}>Gerade keine Keywords.</p>
      ) : (
        <ul className="m-0 flex list-none flex-wrap items-baseline gap-x-[18px] gap-y-2.5 p-0">
          {shown.map((k, i) => (
            <li
              key={k.keyword}
              className={cn('font-bold leading-[1.15]', DASH_DISPLAY, TONE[styles[i].tone])}
              style={{ fontSize: styles[i].fontSize }}
            >
              {k.keyword}
            </li>
          ))}
        </ul>
      )}
    </BriefingCard>
  );
}

/**
 * X-Trends nach Platzierung; eingeklappt zehn, offen dreißig. Trends, die auch
 * in den Nachrichten stehen, sind hervorgehoben (siehe `trendInTheNews`).
 */
export function XTrendsCard({
  state,
  trends,
  keywords,
  greensTitles,
  locale,
}: {
  state: BriefingCardState;
  trends: SocialTrend[] | null;
  keywords: MonitorKeywordEntry[];
  greensTitles: string[];
  locale: MonitorLocale;
}) {
  const sorted = [...(trends ?? [])].sort((a, b) => a.rank - b.rank);
  const shown = sorted.slice(0, state.open ? 30 : 10);
  const keywordSet = new Set(keywords.map((k) => k.keyword.toLocaleLowerCase('de-DE')));

  return (
    <BriefingCard state={state} title="X-Trends" busy={trends === null}>
      {trends === null ? (
        <CloudSkeleton />
      ) : shown.length === 0 ? (
        // trends24.in sperrt den Produktionsserver zeitweise aus (#4070).
        <p className={cn('m-0 text-[15px]', DASH_MUTED)}>
          Gerade keine Trends. Sie werden stündlich aktualisiert.
        </p>
      ) : (
        <ul
          aria-label={`Trends in ${locale === 'at' ? 'Österreich' : 'Deutschland'}`}
          className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-3.5 p-0"
        >
          {shown.map((t) => (
            <li key={`${t.rank}-${t.name}`} className="text-[15px]">
              <a
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'font-bold [overflow-wrap:anywhere]',
                  INLINE_LINK,
                  trendInTheNews(t.name, keywordSet, greensTitles)
                    ? 'text-(--dash-mg-ink)'
                    : 'text-foreground'
                )}
              >
                {t.name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </BriefingCard>
  );
}

function RowsSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      {['w-full', 'w-3/5', 'w-[45%]', 'w-1/3', 'w-1/4'].map((w) => (
        <div key={w} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] items-center gap-3">
          <Bone className="h-4 w-28" />
          <Bone className={cn('h-1.5', w)} />
        </div>
      ))}
    </div>
  );
}

/** Wortbreiten und -höhen der Platzhalter-Wolke; je Eintrag eindeutig, er dient als Key. */
const CLOUD_BONES = [
  'h-8 w-24',
  'h-6 w-20',
  'h-6 w-14',
  'h-6 w-32',
  'h-5 w-[5.5rem]',
  'h-5 w-24',
  'h-4 w-12',
  'h-4 w-16',
  'h-4 w-20',
];

function CloudSkeleton() {
  return (
    <div aria-hidden className="flex flex-wrap items-baseline gap-x-[18px] gap-y-3">
      {CLOUD_BONES.map((c) => (
        <Bone key={c} className={c} />
      ))}
    </div>
  );
}
