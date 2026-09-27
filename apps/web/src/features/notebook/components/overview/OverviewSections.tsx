import { type TopicCategory } from '@gruenerator/contracts';
import { getAgentSlug, type Agent } from '@gruenerator/shared/agents';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  WordCloud,
  cn,
} from '@gruenerator/ui';
import { useId, type ReactNode } from 'react';
import { FiArrowDownRight, FiArrowRight, FiArrowUpRight, FiExternalLink } from 'react-icons/fi';
import { Link } from 'react-router-dom';

import { formatRelativeDate } from '../../../../utils/dateFormatter';
import { TOPIC_CONFIG } from '../../../monitor/topicConfig';
import { type NotebookOverview } from '../../hooks/useNotebookOverview';
import {
  NOTEBOOK_CARD,
  NOTEBOOK_MARK,
  NOTEBOOK_TEXT_MUTED,
  NOTEBOOK_TEXT_STRONG,
} from '../../notebookTheme';

const TRACK = 'bg-[#F4E6ED] dark:bg-white/10';
const nf = new Intl.NumberFormat('de-DE');
const pct = (share: number) => `${Math.round(share * 100)} %`;

function monthLabel(month: string, style: 'short' | 'long' = 'short'): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('de-DE', {
    month: style,
    year: style === 'short' ? '2-digit' : 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function dateLabel(value: string | null): string {
  if (!value) return '–';
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return '–';
  return new Intl.DateTimeFormat('de-DE', { month: 'short', year: 'numeric' }).format(t);
}

function topicName(topic: TopicCategory): string {
  return TOPIC_CONFIG[topic].name;
}

export function OverviewCard({
  title,
  subtitle,
  className,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  className?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn(NOTEBOOK_CARD, 'flex min-w-0 flex-col gap-4 p-5 md:p-6', className)}
    >
      <header className="flex flex-col gap-1">
        <h2 id={headingId} className={cn('text-base font-bold', NOTEBOOK_TEXT_STRONG)}>
          {title}
        </h2>
        {subtitle && <p className={cn('text-[13px]', NOTEBOOK_TEXT_MUTED)}>{subtitle}</p>}
      </header>
      {children}
      {footer && <p className={cn('mt-auto text-xs', NOTEBOOK_TEXT_MUTED)}>{footer}</p>}
    </section>
  );
}

// ── Kennzahlen ──────────────────────────────────────────────────────────────

function Kpi({ label, value, detail }: { label: string; value: ReactNode; detail: ReactNode }) {
  return (
    <div className={cn(NOTEBOOK_CARD, 'flex flex-col gap-1 px-5 py-4')}>
      <span className={cn('text-xs font-semibold uppercase tracking-wide', NOTEBOOK_TEXT_MUTED)}>
        {label}
      </span>
      <span
        className={cn(
          'text-[26px] font-extrabold leading-tight tracking-[-0.01em] tabular-nums',
          NOTEBOOK_TEXT_STRONG
        )}
      >
        {value}
      </span>
      <span className={cn('text-[13px]', NOTEBOOK_TEXT_MUTED)}>{detail}</span>
    </div>
  );
}

function newDocsDetail(last: number, previous: number): string {
  const diff = last - previous;
  if (diff === 0) return 'so viele wie in den 30 Tagen davor';
  return `${diff > 0 ? '+' : '−'}${nf.format(Math.abs(diff))} gegenüber den 30 Tagen davor`;
}

export function OverviewKpis({ overview }: { overview: NotebookOverview }) {
  const { totals, contentTypes, sources } = overview;
  return (
    <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4">
      <Kpi
        label="Dokumente"
        value={nf.format(totals.documents)}
        detail={
          totals.undated > 0 ? `davon ${nf.format(totals.undated)} ohne Datum` : 'alle datiert'
        }
      />
      <Kpi
        label="Neu in 30 Tagen"
        value={nf.format(totals.last30Days)}
        detail={newDocsDetail(totals.last30Days, totals.previous30Days)}
      />
      <Kpi
        label="Zeitraum"
        value={<span className="text-xl">{dateLabel(totals.firstPublished)}</span>}
        detail={`bis ${dateLabel(totals.lastPublished)}`}
      />
      <Kpi
        label="Formate"
        value={nf.format(contentTypes.length)}
        detail={
          sources.length > 1
            ? `aus ${nf.format(sources.length)} Quellen`
            : (contentTypes[0]?.label ?? '–')
        }
      />
    </div>
  );
}

// ── Aktivität ───────────────────────────────────────────────────────────────

export function ActivityChart({ overview }: { overview: NotebookOverview }) {
  const { monthly, totals } = overview;
  const max = Math.max(1, ...monthly.map((m) => m.count));
  const total = monthly.reduce((sum, m) => sum + m.count, 0);
  const last = monthly.length - 1;

  return (
    <OverviewCard
      title="Aktivität"
      className="lg:col-span-2"
      subtitle={
        <>
          {nf.format(total)} Veröffentlichungen in den letzten 24 Monaten
          {totals.undated > 0 && ` · ${nf.format(totals.undated)} ohne Datum nicht enthalten`}
        </>
      }
    >
      <TooltipProvider delayDuration={80}>
        <div aria-hidden className="flex h-40 items-end gap-[2px]">
          {monthly.map((m) => (
            <Tooltip key={m.month}>
              <TooltipTrigger asChild>
                <div className="group flex h-full min-w-0 flex-1 cursor-default items-end">
                  <div
                    className={cn(
                      'w-full rounded-t-[4px] transition-opacity group-hover:opacity-80',
                      m.count > 0 ? NOTEBOOK_MARK : ''
                    )}
                    style={{ height: `${(m.count / max) * 100}%` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <span className="font-semibold">{monthLabel(m.month, 'long')}</span>
                {' · '}
                {nf.format(m.count)} {m.count === 1 ? 'Dokument' : 'Dokumente'}
                {m.topTopic && ` · meist ${topicName(m.topTopic)}`}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
      <div
        aria-hidden
        className="-mt-2 flex gap-[2px] border-t border-grey-200 pt-1.5 dark:border-white/15"
      >
        {monthly.map((m, i) => (
          <span
            key={m.month}
            className={cn('min-w-0 flex-1 whitespace-nowrap text-[11px]', NOTEBOOK_TEXT_MUTED)}
          >
            {(last - i) % 6 === 0 ? monthLabel(m.month) : ''}
          </span>
        ))}
      </div>
      <div className="sr-only">
        <table>
          <caption>Veröffentlichungen pro Monat</caption>
          <thead>
            <tr>
              <th scope="col">Monat</th>
              <th scope="col">Dokumente</th>
              <th scope="col">Häufigstes Thema</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m) => (
              <tr key={m.month}>
                <td>{monthLabel(m.month, 'long')}</td>
                <td>{m.count}</td>
                <td>{m.topTopic ? topicName(m.topTopic) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OverviewCard>
  );
}

// ── Themenprofil ────────────────────────────────────────────────────────────

const TREND_LABEL = { up: 'im Aufwind', down: 'rückläufig' } as const;

export function TopicProfile({
  overview,
  onSelectTopic,
}: {
  overview: NotebookOverview;
  onSelectTopic: (topic: TopicCategory) => void;
}) {
  const { topics } = overview;
  const hasBaseline = topics.some((t) => t.baselineShare !== null);
  const scale = Math.max(...topics.map((t) => Math.max(t.share, t.baselineShare ?? 0)));
  const classified = topics.reduce((sum, t) => sum + t.count, 0);

  return (
    <OverviewCard
      title="Themenprofil"
      subtitle={`Hauptthema je Dokument · ${nf.format(classified)} von ${nf.format(overview.totals.documents)} eingeordnet`}
      footer={
        <>
          Ein Klick öffnet den Chat, gefiltert auf das Thema. „Im Aufwind“ und „rückläufig“
          vergleichen die letzten 90 Tage mit den zwölf Monaten davor und erscheinen nur bei einem
          statistisch deutlichen Unterschied.
        </>
      }
    >
      {hasBaseline && (
        <p className={cn('flex items-center gap-2 text-xs', NOTEBOOK_TEXT_MUTED)}>
          <span
            aria-hidden
            className="inline-block h-3 w-[2px] rounded bg-[#22382E] dark:bg-[#E4EDE8]"
          />
          Durchschnitt aller Landesverbände
        </p>
      )}
      <ul className="flex flex-col">
        {topics.map((t) => {
          const Icon = TOPIC_CONFIG[t.topic].icon;
          const trend = t.trend === 'up' || t.trend === 'down' ? t.trend : null;
          const baselineText =
            t.baselineShare !== null
              ? `, Durchschnitt aller Landesverbände ${pct(t.baselineShare)}`
              : '';
          return (
            <li key={t.topic}>
              <button
                type="button"
                onClick={() => onSelectTopic(t.topic)}
                aria-label={`${topicName(t.topic)}: ${pct(t.share)}${trend ? `, ${TREND_LABEL[trend]}` : ''}${baselineText}. Im Chat nach diesem Thema filtern`}
                className={cn(
                  'grid w-full grid-cols-[1.25rem_7.5rem_1fr_2.75rem] items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-1.5 text-left',
                  'transition-colors hover:bg-[#FBEDF4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6006E]/50 dark:hover:bg-white/5',
                  // Phones: name and share on one line, the bar full width below.
                  'max-sm:grid-cols-[1.25rem_1fr_2.75rem]'
                )}
              >
                <Icon aria-hidden className={cn('size-4', NOTEBOOK_TEXT_MUTED)} />
                <span className={cn('flex flex-col text-sm font-medium', NOTEBOOK_TEXT_STRONG)}>
                  <span className="truncate">{topicName(t.topic)}</span>
                  {trend && (
                    <span
                      className={cn(
                        'flex items-center gap-0.5 text-[11px] font-semibold',
                        NOTEBOOK_TEXT_MUTED
                      )}
                    >
                      {trend === 'up' ? (
                        <FiArrowUpRight aria-hidden />
                      ) : (
                        <FiArrowDownRight aria-hidden />
                      )}
                      {TREND_LABEL[trend]}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'relative h-2.5 rounded-full max-sm:col-span-2 max-sm:col-start-2 max-sm:row-start-2',
                    TRACK
                  )}
                >
                  <span
                    className={cn('absolute inset-y-0 left-0 rounded-full', NOTEBOOK_MARK)}
                    style={{ width: `${(t.share / scale) * 100}%` }}
                  />
                  {t.baselineShare !== null && (
                    <span
                      aria-hidden
                      className="absolute -top-[3px] h-4 w-[2px] -translate-x-1/2 rounded bg-[#22382E] dark:bg-[#E4EDE8]"
                      style={{ left: `${(t.baselineShare / scale) * 100}%` }}
                    />
                  )}
                </span>
                <span
                  className={cn(
                    'text-right text-sm tabular-nums max-sm:col-start-3 max-sm:row-start-1',
                    NOTEBOOK_TEXT_STRONG
                  )}
                >
                  {pct(t.share)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </OverviewCard>
  );
}

// ── Köpfe ───────────────────────────────────────────────────────────────────

export function PeopleList({ overview }: { overview: NotebookOverview }) {
  return (
    <OverviewCard
      title="Köpfe"
      subtitle="Am häufigsten genannte Personen · Anzahl Dokumente"
      footer="Automatisch erkannt – einzelne Namen können falsch zugeordnet sein."
    >
      <ol className="flex flex-col divide-y divide-grey-100 dark:divide-white/10">
        {overview.persons.map((p, i) => (
          <li key={p.person} className="flex items-baseline gap-3 py-2">
            <span className={cn('w-5 text-right text-xs tabular-nums', NOTEBOOK_TEXT_MUTED)}>
              {i + 1}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn('truncate text-sm font-medium', NOTEBOOK_TEXT_STRONG)}>
                {p.person}
              </span>
              {p.recentCount > 0 && (
                <span className={cn('text-xs tabular-nums', NOTEBOOK_TEXT_MUTED)}>
                  davon {nf.format(p.recentCount)} in den letzten 90 Tagen
                </span>
              )}
            </span>
            <span className={cn('w-10 text-right text-sm tabular-nums', NOTEBOOK_TEXT_STRONG)}>
              {nf.format(p.count)}
            </span>
          </li>
        ))}
      </ol>
    </OverviewCard>
  );
}

// ── Formate & Quellen ───────────────────────────────────────────────────────

function BarList({
  label,
  items,
}: {
  /** Omitted when the card title already says it. */
  label: string | null;
  items: Array<{ value: string; label: string; count: number }>;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <h3 className={cn('text-xs font-semibold uppercase tracking-wide', NOTEBOOK_TEXT_MUTED)}>
          {label}
        </h3>
      )}
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item.value} className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className={cn('truncate', NOTEBOOK_TEXT_STRONG)}>{item.label}</span>
              <span className={cn('tabular-nums', NOTEBOOK_TEXT_STRONG)}>
                {nf.format(item.count)}
              </span>
            </span>
            <span className={cn('relative h-2 rounded-full', TRACK)}>
              <span
                className={cn('absolute inset-y-0 left-0 rounded-full', NOTEBOOK_MARK)}
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SourceMix({ overview }: { overview: NotebookOverview }) {
  const showSources = overview.sources.length > 1;
  return (
    <OverviewCard title={showSources ? 'Formate & Quellen' : 'Formate'}>
      {overview.contentTypes.length > 0 && (
        <BarList label={showSources ? 'Formate' : null} items={overview.contentTypes} />
      )}
      {showSources && <BarList label="Quellen" items={overview.sources} />}
    </OverviewCard>
  );
}

// ── Zuletzt ─────────────────────────────────────────────────────────────────

export function RecentDocuments({ overview }: { overview: NotebookOverview }) {
  return (
    <OverviewCard title="Zuletzt veröffentlicht">
      <ul className="flex flex-col divide-y divide-grey-100 dark:divide-white/10">
        {overview.recent.map((doc) => {
          const meta = [
            doc.publishedAt ? formatRelativeDate(doc.publishedAt) : null,
            doc.contentTypeLabel,
            doc.sourceLabel,
          ].filter(Boolean);
          const title = (
            <span className={cn('line-clamp-2 text-sm font-semibold', NOTEBOOK_TEXT_STRONG)}>
              {doc.title}
            </span>
          );
          return (
            <li key={doc.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
              {doc.url ? (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-2 no-underline hover:underline"
                >
                  {title}
                  <FiExternalLink
                    aria-hidden
                    className={cn(
                      'mt-0.5 size-3.5 shrink-0 opacity-60 group-hover:opacity-100',
                      NOTEBOOK_TEXT_MUTED
                    )}
                  />
                  <span className="sr-only">(öffnet in neuem Tab)</span>
                </a>
              ) : (
                title
              )}
              <span
                className={cn(
                  'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs',
                  NOTEBOOK_TEXT_MUTED
                )}
              >
                {meta.join(' · ')}
                {doc.themes.slice(0, 2).map((topic) => (
                  <span
                    key={topic}
                    className="rounded-full bg-[#F4E6ED] px-2 py-0.5 text-[11px] font-medium text-[#6B2A4A] dark:bg-white/10 dark:text-[#F2C6DA]"
                  >
                    {topicName(topic)}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </OverviewCard>
  );
}

// ── Begriffe ────────────────────────────────────────────────────────────────

/** Lemmas arrive lower-cased; German nouns read wrong that way. */
const nounCase = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export function TermCloud({
  terms,
  documents,
}: {
  terms: NonNullable<NotebookOverview['terms']>;
  documents: number;
}) {
  const coverage =
    terms.documents < documents
      ? `${nf.format(terms.documents)} von ${nf.format(documents)} Dokumenten`
      : `${nf.format(terms.documents)} Dokumenten`;
  return (
    <OverviewCard
      title="Begriffe"
      subtitle={`Häufigste Schlagwörter aus ${coverage}`}
      footer={
        terms.rising.length > 0 ? (
          <>„Im Aufwind“ vergleicht die letzten 90 Tage mit den zwölf Monaten davor.</>
        ) : undefined
      }
    >
      <div className={NOTEBOOK_TEXT_STRONG}>
        <WordCloud
          items={terms.words.map((w) => ({
            key: w.word,
            label: nounCase(w.word),
            value: w.count,
            tooltip: `in ${nf.format(w.count)} Dokumenten`,
          }))}
          maxFontSize={1.9}
        />
      </div>
      {terms.rising.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3
            className={cn(
              'flex items-center gap-1 text-xs font-semibold uppercase tracking-wide',
              NOTEBOOK_TEXT_MUTED
            )}
          >
            <FiArrowUpRight aria-hidden />
            Im Aufwind
          </h3>
          <ul className="flex flex-wrap gap-2">
            {terms.rising.map((w) => (
              <li
                key={w.word}
                className={cn(
                  'rounded-full border border-[rgba(82,144,122,0.18)] px-3 py-1 text-sm dark:border-[#2C4A3B]',
                  NOTEBOOK_TEXT_STRONG
                )}
              >
                {nounCase(w.word)}{' '}
                <span className={cn('tabular-nums', NOTEBOOK_TEXT_MUTED)}>
                  {nf.format(w.recentCount)}
                  <span className="sr-only"> Dokumente in den letzten 90 Tagen</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </OverviewCard>
  );
}

// ── Grüneratoren ────────────────────────────────────────────────────────────

export function NotebookGrueneratoren({
  agents,
  hub,
}: {
  agents: readonly Agent[];
  hub: { slug: string; name: string } | null;
}) {
  return (
    <OverviewCard
      title="Grüneratoren"
      className="lg:col-span-2"
      subtitle="Für Pressearbeit, Bürger*innenanfragen und Wahlprüfsteine – mit diesem Notebook als Wissensbasis"
    >
      <ul className="grid gap-2 md:grid-cols-3">
        {agents.map((agent) => (
          <li key={agent.identifier}>
            <Link
              to={`/agents/${getAgentSlug(agent.identifier)}`}
              className={cn(
                'group flex h-full items-center gap-3 rounded-lg border border-[rgba(82,144,122,0.18)] px-4 py-3 no-underline',
                'transition-colors hover:border-[#D6006E]/50 hover:bg-[#FBEDF4] dark:border-[#2C4A3B] dark:hover:bg-white/5'
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn('text-sm font-semibold', NOTEBOOK_TEXT_STRONG)}>
                  {agent.title}
                </span>
                {agent.description && (
                  <span className={cn('line-clamp-2 text-xs', NOTEBOOK_TEXT_MUTED)}>
                    {agent.description}
                  </span>
                )}
              </span>
              <FiArrowRight aria-hidden className={cn('size-4 shrink-0', NOTEBOOK_TEXT_MUTED)} />
            </Link>
          </li>
        ))}
      </ul>
      {hub && (
        <Link
          to={`/agents/${hub.slug}`}
          className="text-sm font-semibold text-[#B4005C] no-underline hover:underline dark:text-[#F2A1C6]"
        >
          Alle Grüneratoren von {hub.name}
        </Link>
      )}
    </OverviewCard>
  );
}
