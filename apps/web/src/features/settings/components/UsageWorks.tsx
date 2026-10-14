/**
 * "Deine Werke" — what this account created, all time, plus a GitHub-style
 * activity calendar over the last year.
 *
 * Plain CSS grid for the calendar, same reasoning as the token bars in
 * UsageTab: a charting library is a lot of bundle for 371 squares.
 */
import { type GetUserActivityResponseDto, type UserActivityDayDto } from '@gruenerator/contracts';
import { useEffect, useRef } from 'react';

import { DOCUMENT_TYPE_LABELS, formatCount, formatDate } from '../../../utils/usageFormat';
import { useUsageActivity } from '../hooks/useUsageActivity';

import { SettingsStatsSkeleton } from './SettingsSkeleton';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Same zone the server buckets by, so "today" is the same square on both sides. */
const berlinDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const monthLabel = new Intl.DateTimeFormat('de-DE', { month: 'short', timeZone: 'UTC' });

function toDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function dayMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

export interface CalendarCell {
  day: string;
  count: number;
  /** 0 = nothing, 1–4 = quartiles of the busiest day. */
  level: number;
  /** Alignment padding before the window starts — rendered invisible. */
  outside: boolean;
}

/**
 * Weeks (Monday-first columns) covering the last 365 days up to `today`.
 * The first column is padded back to Monday so rows line up with weekdays.
 */
export function buildCalendar(heatmap: UserActivityDayDto[], today: string): CalendarCell[][] {
  const counts = new Map(heatmap.map((entry) => [entry.day, entry.count]));
  const max = heatmap.reduce((m, entry) => Math.max(m, entry.count), 0);
  const end = dayMs(today);
  const windowStart = end - 364 * DAY_MS;
  const weekday = (new Date(windowStart).getUTCDay() + 6) % 7;
  const gridStart = windowStart - weekday * DAY_MS;

  const weeks: CalendarCell[][] = [];
  for (let ms = gridStart; ms <= end; ms += DAY_MS) {
    const day = toDay(ms);
    const count = counts.get(day) ?? 0;
    const cell: CalendarCell = {
      day,
      count,
      level: count === 0 || max === 0 ? 0 : Math.max(1, Math.ceil((count / max) * 4)),
      outside: ms < windowStart,
    };
    const index = Math.floor((ms - gridStart) / (7 * DAY_MS));
    (weeks[index] ??= []).push(cell);
  }
  return weeks;
}

export function longestStreak(heatmap: UserActivityDayDto[]): number {
  let best = 0;
  let current = 0;
  let previous: number | null = null;
  for (const entry of [...heatmap].sort((a, b) => a.day.localeCompare(b.day))) {
    if (entry.count <= 0) continue;
    const ms = dayMs(entry.day);
    current = previous !== null && ms - previous === DAY_MS ? current + 1 : 1;
    best = Math.max(best, current);
    previous = ms;
  }
  return best;
}

const LEVEL_CLASSES = [
  'bg-grey-100 dark:bg-grey-800',
  'bg-primary/25',
  'bg-primary/50',
  'bg-primary/75',
  'bg-primary',
];

function WorkTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-grey-200 bg-background p-md dark:border-grey-700">
      <span className="text-xs text-grey-500">{label}</span>
      <span className="text-xl font-semibold text-foreground-heading">{value}</span>
    </div>
  );
}

function ActivityCalendar({ heatmap }: { heatmap: UserActivityDayDto[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const weeks = buildCalendar(heatmap, berlinDay.format(new Date()));
  const activeDays = heatmap.filter((entry) => entry.count > 0).length;
  const busiest = heatmap.reduce<UserActivityDayDto | null>(
    (best, entry) => (best === null || entry.count > best.count ? entry : best),
    null
  );

  // Most recent weeks sit at the right edge; on a phone that is where to start.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  return (
    <section className="flex flex-col gap-sm">
      <h3 className="m-0 text-sm font-semibold text-foreground-heading">
        Aktivität im letzten Jahr
      </h3>
      <div
        ref={scrollRef}
        className="overflow-x-auto rounded-xl border border-grey-200 p-sm dark:border-grey-700"
      >
        <div
          role="img"
          aria-label={`Aktivitätskalender: an ${formatCount(activeDays)} von 365 Tagen aktiv`}
          className="flex w-max gap-[3px]"
        >
          {weeks.map((week) => {
            const firstOfMonth = week.find((cell) => !cell.outside && cell.day.endsWith('-01'));
            return (
              <div key={week[0].day} className="flex flex-col gap-[3px]">
                <span className="h-4 whitespace-nowrap text-[10px] leading-4 text-grey-500">
                  {firstOfMonth ? monthLabel.format(new Date(dayMs(firstOfMonth.day))) : ''}
                </span>
                {week.map((cell) => (
                  <div
                    key={cell.day}
                    className={`size-[11px] rounded-[2px] ${cell.outside ? 'invisible' : LEVEL_CLASSES[cell.level]}`}
                    title={
                      cell.outside
                        ? undefined
                        : `${formatDate(cell.day)}: ${formatCount(cell.count)} ${cell.count === 1 ? 'Aktion' : 'Aktionen'}`
                    }
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-sm text-xs text-grey-500">
        <span>
          <strong className="block text-sm text-foreground-heading">
            {formatCount(activeDays)}
          </strong>
          aktive Tage
        </span>
        <span>
          <strong className="block text-sm text-foreground-heading">
            {formatCount(longestStreak(heatmap))}
          </strong>
          Tage längste Serie
        </span>
        <span>
          <strong className="block text-sm text-foreground-heading">
            {busiest ? formatDate(busiest.day) : '—'}
          </strong>
          aktivster Tag{busiest ? ` (${formatCount(busiest.count)})` : ''}
        </span>
      </div>
      <p className="m-0 text-xs text-grey-500">
        Eine Aktion ist eine Chat-Nachricht von dir, ein angelegtes Dokument oder Design oder ein
        KI-Bild.
      </p>
    </section>
  );
}

function worksTiles(works: GetUserActivityResponseDto['works']) {
  return [
    { label: 'Chats', value: works.chats },
    { label: 'Nachrichten von dir', value: works.user_messages },
    { label: 'Wörter vom Grünerator (Chat)', value: works.assistant_words },
    { label: 'Dokumente', value: works.documents },
    { label: 'Sharepics & Designs', value: works.designs },
    { label: 'KI-Bilder', value: works.ai_images },
    { label: 'Untertitelte Videos', value: works.subtitled_videos },
    { label: 'Deep Research', value: works.deep_research },
  ].filter((tile) => tile.value > 0);
}

export function UsageWorks() {
  const { data, isPending, isError } = useUsageActivity();
  const tiles = data ? worksTiles(data.works) : [];

  return (
    <section className="flex flex-col gap-lg">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-lg font-semibold text-foreground-heading">Deine Werke</h2>
        {data?.member_since && (
          <p className="m-0 text-sm text-grey-500">
            Dabei seit {formatDate(data.member_since)} — gezählt über die gesamte Zeit.
          </p>
        )}
      </div>

      {isPending ? (
        <SettingsStatsSkeleton />
      ) : isError || !data ? (
        <p className="m-0 text-sm text-grey-500">
          Deine Werke konnten nicht geladen werden. Bitte versuche es später erneut.
        </p>
      ) : (
        <>
          {tiles.length === 0 ? (
            <p className="m-0 rounded-xl border border-dashed border-grey-300 p-lg text-sm text-grey-500 dark:border-grey-700">
              Du hast noch nichts erstellt.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-sm md:grid-cols-4">
              {tiles.map((tile) => (
                <WorkTile key={tile.label} label={tile.label} value={formatCount(tile.value)} />
              ))}
            </div>
          )}

          {data.documents_by_type.length > 1 && (
            <section className="flex flex-col gap-sm">
              <h3 className="m-0 text-sm font-semibold text-foreground-heading">
                Dokumente nach Art
              </h3>
              <ul className="m-0 flex list-none flex-wrap gap-xs p-0">
                {data.documents_by_type.map((entry) => (
                  <li
                    key={entry.subtype}
                    className="rounded-full border border-grey-200 px-sm py-1 text-xs dark:border-grey-700"
                  >
                    {DOCUMENT_TYPE_LABELS[entry.subtype]}{' '}
                    <span className="tabular-nums text-grey-500">{formatCount(entry.count)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ActivityCalendar heatmap={data.heatmap} />

          <p className="m-0 text-xs text-grey-500">
            Gezählt wird, was du angelegt hast, auch was im Papierkorb liegt. Endgültig gelöschte
            Inhalte zählen nicht mehr mit. Wörter zählen nur die Antworten im Chat. Die Zahlen
            aktualisieren sich alle paar Minuten.
          </p>
        </>
      )}
    </section>
  );
}
