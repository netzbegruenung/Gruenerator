import { type WhatHappenedArticle, type MonitorArticle } from '@gruenerator/contracts';
import { cn } from '@gruenerator/ui';
import { ArrowRight, BarChart3, Eye, Flame, Rss, type LucideIcon } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { lvName } from '../../monitor/bundeslaender';
import {
  useEntityResults,
  useMonitorSnapshot,
  usePolls,
  useWhatHappened,
} from '../../monitor/hooks/useMonitor';
import { useMonitorLocaleParam } from '../../monitor/hooks/useMonitorLocaleParam';
import { deltaText, grueneSnapshot, isGruene, pct } from '../../monitor/pollFormat';

import { WISSEN_TILE } from './wissenTilePalette';

// Tool-Widgets der /wissen-Seite: dieselbe Kachelfläche, Schriftgrößen (14/16/17
// Titel, 12/13/14 Text) und derselbe Innenabstand (p-4) wie die Notebook-Kacheln,
// nur mit Live-Inhalt statt einer Textzeile. Fehlt die Datenlage (lädt, leer,
// Fehler), zeigt das Widget die statische Beschreibung der Kachel.

// Neutrale Fläche in Hell und Dunkel; Farbe tragen nur Icon und Link (WISSEN_TILE.icon).
const TILE =
  'bg-grey-100 hover:shadow-[0_14px_30px_rgba(0,0,0,0.10)] dark:hover:shadow-none dark:bg-white/[0.03] dark:ring-1 dark:ring-white/[0.06] dark:hover:bg-white/[0.05]';
const TITLE = 'text-foreground-heading';
const MUTED = 'text-grey-600 dark:text-grey-300';
const STRONG = 'text-foreground';
const CHIP = 'bg-grey-200 text-foreground dark:bg-white/[0.08]';
const TRACK = 'bg-grey-200 dark:bg-white/[0.08]';
const BAR = 'bg-grey-500 dark:bg-grey-300';

const TEXT_SM = 'text-[12px] leading-snug sm:text-[13px] lg:text-[14px]';

/** „vor 2 Std." / „gestern" — leer, wenn das Datum fehlt oder nicht lesbar ist. */
function ago(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const min = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}

interface WidgetProps {
  to: string;
  Icon: LucideIcon;
  title: string;
  /** Statische Beschreibung — Rückfall, solange es keine Live-Daten gibt. */
  fallback: string;
  children: ReactNode | null;
}

function Widget({ to, Icon, title, fallback, children }: WidgetProps) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex h-full min-w-0 flex-col gap-3 rounded-2xl p-4 text-left no-underline transition-shadow duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600',
        TILE
      )}
    >
      <span className="mb-2 flex items-center gap-2">
        <Icon aria-hidden className={cn('size-6 shrink-0', WISSEN_TILE.icon)} />
        <span
          className={cn(
            'min-w-0 flex-1 text-[14px] font-bold leading-tight sm:text-[16px] lg:text-[17px]',
            TITLE
          )}
        >
          {title}
        </span>
        <ArrowRight
          aria-hidden
          className={cn(
            'size-5 shrink-0 -translate-x-1 opacity-0 transition duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transition-none',
            WISSEN_TILE.icon
          )}
        />
      </span>
      {children ?? <p className={cn('m-0', TEXT_SM, MUTED)}>{fallback}</p>}
    </Link>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[12px] font-bold leading-snug',
        CHIP
      )}
    >
      {children}
    </span>
  );
}

function ArticleLine({ title, meta }: { title: string; meta: string }) {
  return (
    <li className="min-w-0">
      <span className={cn('line-clamp-2 break-words font-bold', TEXT_SM, STRONG)}>{title}</span>
      <span className={cn('block text-[12px] leading-snug', MUTED)}>{meta}</span>
    </li>
  );
}

function ThemenWidget({ to, locale }: { to: string; locale: 'de' | 'at' }) {
  const { data } = useMonitorSnapshot(locale);
  const keywords = data?.keywords ?? [];
  const top = keywords.slice(0, 4);
  const max = top[0]?.count || 1;
  const trends = (data?.socialTrends ?? []).slice(0, 2);
  return (
    <Widget
      to={to}
      Icon={Flame}
      title="Themen & Trends"
      fallback="Meistdiskutierte Themen und X-Trends der letzten 24 Stunden."
    >
      {top.length > 0 ? (
        <>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {top.map((k) => (
              <li key={k.keyword} className="flex flex-col gap-1">
                <span className={cn('flex justify-between gap-2 font-bold', TEXT_SM, STRONG)}>
                  <span className="min-w-0 truncate">{k.keyword}</span>
                  <span className={cn('shrink-0 font-normal', MUTED)}>{k.count}</span>
                </span>
                <span className={cn('h-1.5 w-full rounded-full', TRACK)}>
                  <span
                    className={cn('block h-1.5 rounded-full', BAR)}
                    style={{ width: `${Math.max(8, Math.round((k.count / max) * 100))}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
          {trends.length > 0 && (
            <span className="flex flex-wrap gap-1.5">
              {trends.map((t) => (
                <Chip key={t.rank}>
                  <span className="max-w-[12rem] truncate">{t.name}</span>
                </Chip>
              ))}
            </span>
          )}
        </>
      ) : null}
    </Widget>
  );
}

function FeedWidget({ to, locale }: { to: string; locale: 'de' | 'at' }) {
  // Gleicher Query-Key wie /feed. Der Strom ist rein deutsch — unter `at`
  // zeigt /feed ihn gar nicht, also führt die Kachel dort keine LV-Schlagzeile.
  const { data } = useWhatHappened(locale, { days: 7 });
  const articles: WhatHappenedArticle[] =
    locale === 'at' ? [] : (data?.days ?? []).flatMap((d) => d.articles ?? []).slice(0, 4);
  return (
    <Widget
      to={to}
      Icon={Rss}
      title="Feed"
      fallback="Bluesky und neue Beiträge der Landesverbände."
    >
      {articles.length > 0 ? (
        <>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {articles.map((a) => (
              <ArticleLine
                key={a.sourceUrl}
                title={a.title}
                meta={[
                  ago(a.publishedAt ?? a.indexedAt),
                  a.landesverband ? lvName(a.landesverband) : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ))}
          </ul>
        </>
      ) : null}
    </Widget>
  );
}

function WatcherWidget({ to, locale }: { to: string; locale: 'de' | 'at' }) {
  // Gleicher Query-Key wie /watcher.
  const { data } = useEntityResults(locale === 'at' ? 'gruene-at' : 'gruene', locale);
  const articles: MonitorArticle[] = (data?.articles ?? []).slice(0, 4);
  return (
    <Widget to={to} Icon={Eye} title="Watcher" fallback="Berichterstattung über die Grünen.">
      {articles.length > 0 ? (
        <>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {articles.map((a) => (
              <ArticleLine
                key={a.url}
                title={a.title}
                meta={[a.source, ago(a.publishedAt)].filter(Boolean).join(' · ')}
              />
            ))}
          </ul>
        </>
      ) : null}
    </Widget>
  );
}

/** Verlauf der Grünen als Linie; Strichstärke bleibt beim Skalieren konstant. */
function Sparkline({ values }: { values: number[] }) {
  const s = values.slice(-12);
  if (s.length < 2) return null;
  const min = Math.min(...s);
  const rng = Math.max(...s) - min || 1;
  const pts = s.map((v, i) => `${(i * 100) / (s.length - 1)},${28 - ((v - min) / rng) * 24}`);
  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      aria-hidden
      className="h-10 w-full overflow-visible text-primary-600 dark:text-primary-400"
    >
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function UmfragenWidget({ to, locale }: { to: string; locale: 'de' | 'at' }) {
  const { data } = usePolls(locale === 'at' ? 'oesterreich' : 'deutschland');
  // `average`/`polls` fehlen in einer leeren 200-Antwort (E2E-Fixtures, Teilausfall) — dann kein Widget-Inhalt.
  const g = data?.average && data.polls ? grueneSnapshot(data) : null;
  const others = Object.entries(data?.average ?? {})
    .filter(([party]) => !isGruene(party))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const delta = g?.delta ?? null;
  return (
    <Widget
      to={to}
      Icon={BarChart3}
      title="Umfragen"
      fallback="Sonntagsfrage, Ländertrends und Meinungsbild."
    >
      {g && g.value != null ? (
        <>
          <div className="flex flex-col gap-1">
            <span className={cn('text-[24px] font-bold leading-none lg:text-[28px]', STRONG)}>
              {pct(g.value)}
            </span>
            {delta ? (
              <span className={cn(TEXT_SM, MUTED)}>
                {delta > 0 ? '▲' : '▼'}&nbsp;{deltaText(delta)} zur Vorwoche
              </span>
            ) : null}
          </div>
          <Sparkline values={g.trend.map((p) => p.value)} />
          {others.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {others.map(([party, value]) => (
                <li key={party} className={cn('flex justify-between gap-2', TEXT_SM)}>
                  <span className={MUTED}>{party}</span>
                  <span className={cn('font-bold', STRONG)}>{pct(value)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </Widget>
  );
}

export const WissenToolWidgets = memo(() => {
  const { locale, withLocale } = useMonitorLocaleParam();
  return (
    <section className="mt-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <ThemenWidget to={withLocale('/themen')} locale={locale} />
        <FeedWidget to={withLocale('/feed')} locale={locale} />
        <WatcherWidget to={withLocale('/watcher')} locale={locale} />
        <UmfragenWidget to={withLocale('/umfragen')} locale={locale} />
      </div>
    </section>
  );
});
WissenToolWidgets.displayName = 'WissenToolWidgets';
