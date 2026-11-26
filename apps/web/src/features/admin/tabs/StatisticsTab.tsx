import {
  type AdminStatsBucket,
  type AdminStatsKind,
  type AdminStatsLocale,
  type AdminStatsPoint,
  type AdminStatsSeries,
  type AdminStatsSource,
} from '@gruenerator/contracts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@gruenerator/ui';
import { useId, useState } from 'react';
import { FiChevronDown, FiChevronRight } from 'react-icons/fi';

import {
  DOCUMENT_TYPE_LABELS,
  USAGE_TRACKED_SINCE,
  formatCount,
  formatDate,
} from '../../../utils/usageFormat';
import SegmentedControl from '../../settings/components/SegmentedControl';
import { AdminEmptyState, AdminPanel, AdminStat, AdminStatGrid } from '../components/adminUi';
import { useAdminStats } from '../hooks/useAdminStats';

const KIND_LABELS: Record<AdminStatsKind, string> = {
  active_users: 'Aktive Personen',
  signups: 'Neue Konten',
  chats: 'Chats',
  chat_messages: 'Chat-Nachrichten',
  documents: 'Dokumente',
  designs: 'Sharepics & Designs',
  ai_images: 'KI-Bilder',
  notebooks: 'Notebooks',
  text_generations: 'Text-Generierungen ohne Chat',
  reels: 'Reels',
  podcasts: 'Podcasts',
  explainables: 'Explainables',
  deep_research: 'Deep Research',
  agents: 'Agents',
  recipes: 'Rezepte',
  templates: 'Vorlagen',
  projects: 'Projekte',
  project_posts: 'Projekt-Beiträge',
};

/** What the live count cannot see, per kind. Shown under the expanded row. */
const KIND_NOTES: Partial<Record<AdminStatsKind, string>> = {
  active_users: `Erst seit ${formatDate(USAGE_TRACKED_SINCE)} erfasst. Gezählt wird, wer im Raster mindestens einen KI-Aufruf hatte.`,
  signups:
    'Bei Konten aus der Zeit vor der Umstellung auf Better Auth ist das Anmeldedatum nachgetragen und nicht verlässlich.',
  chats: 'Leere Chats löscht der Grünerator sofort; sie fehlen.',
  text_generations: 'Nur die älteren Text-Grüneratoren außerhalb des Chats.',
  project_posts: 'Gelöschte Beiträge sind endgültig weg und fehlen.',
};

const RECIPE_LABELS: Record<string, string> = {
  preset: 'Preset',
  custom: 'Eigenes',
  recipe: 'Rezept-Stil',
};

function subtypeLabel(kind: AdminStatsKind, subtype: string): string {
  if (kind === 'documents' && subtype in DOCUMENT_TYPE_LABELS) {
    return DOCUMENT_TYPE_LABELS[subtype as keyof typeof DOCUMENT_TYPE_LABELS];
  }
  if (kind === 'recipes') return RECIPE_LABELS[subtype] ?? subtype;
  return subtype;
}

type RangeId = '30d' | '12m' | 'year' | 'all';

const RANGES: { id: RangeId; label: string; buckets: AdminStatsBucket[] }[] = [
  { id: '30d', label: '30 Tage', buckets: ['day', 'week'] },
  { id: '12m', label: '12 Monate', buckets: ['week', 'month'] },
  { id: 'year', label: 'Dieses Jahr', buckets: ['week', 'month'] },
  { id: 'all', label: 'Seit Beginn', buckets: ['month'] },
];

const BUCKET_LABELS: Record<AdminStatsBucket, string> = {
  day: 'Tag',
  week: 'Woche',
  month: 'Monat',
};

const LOCALE_LABELS: Record<AdminStatsLocale, string> = {
  all: 'Alle Länder',
  de: 'Deutschland',
  at: 'Österreich',
  unknown: 'Land unbekannt',
};

const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function rangeWindow(range: RangeId): { from?: string; to?: string } {
  const today = new Date();
  const from = new Date(today);
  if (range === '30d') from.setDate(from.getDate() - 29);
  if (range === '12m') from.setMonth(from.getMonth() - 11, 1);
  if (range === 'year') from.setMonth(0, 1);
  return range === 'all' ? {} : { from: isoDay(from), to: isoDay(today) };
}

function bucketLabel(day: string, bucket: AdminStatsBucket): string {
  if (bucket === 'month') {
    return new Date(`${day}T00:00:00Z`).toLocaleDateString('de-DE', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  return bucket === 'week' ? `Woche ab ${formatDate(day)}` : formatDate(day);
}

const valueOf = (point: AdminStatsPoint, subtype: string | null) =>
  subtype === null
    ? point.total
    : (point.by_subtype.find((entry) => entry.subtype === subtype)?.value ?? 0);

/** Sum over the window, or the peak for people (a person active in two months is one person). */
function summarize(series: AdminStatsSeries, subtype: string | null) {
  const values = series.points.map((point) => valueOf(point, subtype));
  const known = values.filter((v): v is number => v !== null);
  const value =
    series.kind === 'active_users' ? Math.max(0, ...known) : known.reduce((sum, v) => sum + v, 0);
  return { value, partial: known.length < values.length };
}

function formatCell(value: number | null, minGroupSize: number): string {
  return value === null ? `< ${minGroupSize}` : formatCount(value);
}

function Bars({ bars }: { bars: { bucket: string; value: number | null }[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value ?? 0));
  const width = 120;
  const height = 28;
  const step = width / Math.max(bars.length, 1);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {bars.map(({ bucket, value: v }, i) => {
        const h = v === null ? 2 : Math.max(v > 0 ? 2 : 0, (v / max) * height);
        return (
          <rect
            key={bucket}
            x={i * step + step * 0.15}
            y={height - h}
            width={Math.max(step * 0.7, 1)}
            height={h}
            className={
              v === null
                ? 'fill-grey-300 dark:fill-grey-600'
                : 'fill-primary-600 dark:fill-primary-400'
            }
          />
        );
      })}
    </svg>
  );
}

interface RowProps {
  series: AdminStatsSeries;
  bucket: AdminStatsBucket;
  minGroupSize: number;
}

const CHIP =
  'rounded-full border border-grey-300 px-sm py-1 text-sm text-foreground hover:bg-grey-100 aria-pressed:border-foreground-heading aria-pressed:bg-grey-100 aria-pressed:font-medium dark:border-grey-700 dark:hover:bg-grey-800 dark:aria-pressed:bg-grey-800';

function KindDetail({ series, bucket, minGroupSize }: RowProps) {
  const [subtype, setSubtype] = useState<string | null>(null);
  const subtypes = [
    ...new Set(series.points.flatMap((point) => point.by_subtype.map((s) => s.subtype))),
  ];
  const note = KIND_NOTES[series.kind];

  return (
    <div className="flex flex-col gap-sm px-md pb-md">
      {note && <p className="m-0 text-sm text-grey-600 dark:text-grey-400">{note}</p>}
      {subtypes.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-xs p-0">
          <li>
            <button
              type="button"
              onClick={() => setSubtype(null)}
              aria-pressed={subtype === null}
              className={CHIP}
            >
              Alle
            </button>
          </li>
          {subtypes.map((s) => {
            const { value, partial } = summarize(series, s);
            return (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => setSubtype(s)}
                  aria-pressed={subtype === s}
                  className={CHIP}
                >
                  {subtypeLabel(series.kind, s)} · {partial ? 'mind. ' : ''}
                  {formatCount(value)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <table className="w-full max-w-md text-sm">
        <thead>
          <tr className="text-left text-grey-600 dark:text-grey-400">
            <th className="py-1 font-normal">{BUCKET_LABELS[bucket]}</th>
            <th className="py-1 text-right font-normal">
              {subtype === null ? 'Anzahl' : subtypeLabel(series.kind, subtype)}
            </th>
          </tr>
        </thead>
        <tbody>
          {[...series.points].reverse().map((point) => (
            <tr key={point.bucket} className="border-t border-grey-200 dark:border-grey-800">
              <td className="py-1">{bucketLabel(point.bucket, bucket)}</td>
              <td className="py-1 text-right tabular-nums">
                {formatCell(valueOf(point, subtype), minGroupSize)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KindRow({ series, bucket, minGroupSize }: RowProps) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const { value, partial } = summarize(series, null);
  const Chevron = open ? FiChevronDown : FiChevronRight;
  return (
    <li className="border-t border-grey-200 first:border-t-0 dark:border-grey-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={detailId}
        className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-md px-md py-sm text-left hover:bg-grey-100 focus-visible:outline-2 focus-visible:-outline-offset-2 dark:hover:bg-grey-800"
      >
        <Chevron aria-hidden className="text-grey-600 dark:text-grey-400" />
        <span className="font-medium text-foreground-heading">{KIND_LABELS[series.kind]}</span>
        <span className="tabular-nums text-right">
          {series.kind === 'active_users' ? 'Spitze ' : partial ? 'mind. ' : ''}
          {formatCount(value)}
        </span>
        <Bars bars={series.points.map((point) => ({ bucket: point.bucket, value: point.total }))} />
      </button>
      {open && (
        <div id={detailId}>
          <KindDetail series={series} bucket={bucket} minGroupSize={minGroupSize} />
        </div>
      )}
    </li>
  );
}

const HEADLINE_KINDS: AdminStatsKind[] = ['active_users', 'signups', 'chats', 'documents'];

export default function StatisticsTab() {
  const [range, setRange] = useState<RangeId>('12m');
  const [bucket, setBucket] = useState<AdminStatsBucket>('month');
  const [locale, setLocale] = useState<AdminStatsLocale>('all');
  const [source, setSource] = useState<AdminStatsSource>('live');
  const localeId = useId();

  // A country view is month-only (the server explains why); each range has its own buckets.
  const allowed: AdminStatsBucket[] =
    locale === 'all' ? (RANGES.find((r) => r.id === range)?.buckets ?? ['month']) : ['month'];
  const effectiveBucket = allowed.includes(bucket) ? bucket : (allowed.at(-1) ?? 'month');

  const { data, isLoading, isError } = useAdminStats({
    ...rangeWindow(range),
    bucket: effectiveBucket,
    locale,
  });

  const series = data ? (source === 'live' ? data.live : data.counter.series) : [];
  const headline = HEADLINE_KINDS.flatMap((kind) => {
    const s = series.find((entry) => entry.kind === kind);
    return s ? [{ kind, ...summarize(s, null) }] : [];
  });

  return (
    <>
      <div className="flex flex-wrap items-end gap-md">
        <SegmentedControl
          aria-label="Zeitraum"
          value={range}
          onChange={setRange}
          options={RANGES.map((r) => ({ value: r.id, label: r.label }))}
        />
        <SegmentedControl
          aria-label="Raster"
          value={effectiveBucket}
          onChange={setBucket}
          options={allowed.map((b) => ({ value: b, label: BUCKET_LABELS[b] }))}
        />
        <SegmentedControl
          aria-label="Quelle"
          value={source}
          onChange={setSource}
          options={[
            { value: 'live', label: 'Bestand' },
            { value: 'counter', label: 'Zähler' },
          ]}
        />
        <div className="flex items-center gap-xs">
          <label htmlFor={localeId} className="text-sm text-grey-600 dark:text-grey-400">
            Land
          </label>
          <Select value={locale} onValueChange={(v) => setLocale(v as AdminStatsLocale)}>
            <SelectTrigger id={localeId} className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(LOCALE_LABELS) as AdminStatsLocale[]).map((l) => (
                <SelectItem key={l} value={l}>
                  {LOCALE_LABELS[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {data && (
          <span className="ml-auto text-sm text-grey-600 dark:text-grey-400">
            Stand:{' '}
            {new Date(data.generated_at).toLocaleTimeString('de-DE', {
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            · bis zu 15 Minuten verzögert
          </span>
        )}
      </div>

      <p className="m-0 max-w-[80ch] text-sm text-grey-600 dark:text-grey-400">
        {source === 'live'
          ? 'Gezählt wird, was heute noch da ist (auch im Papierkorb). Endgültig Gelöschtes und gelöschte Konten fehlen.'
          : data?.counter.since
            ? `Der Zähler zählt beim Anlegen und vergisst nichts. Er läuft seit ${formatDate(data.counter.since)}.`
            : 'Der Zähler zählt beim Anlegen und vergisst nichts. Er hat noch keine Daten.'}{' '}
        {locale !== 'all' &&
          `Mit Länderfilter bleiben Werte hinter weniger als ${data?.min_group_size ?? 5} Personen verborgen („< ${data?.min_group_size ?? 5}"), dazu was sich sonst aus der Gesamtzahl zurückrechnen ließe. Das Land ist das heutige im Profil.`}
      </p>

      {isLoading ? (
        <div className="flex flex-col gap-sm">
          <Skeleton className="h-20 w-full" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : isError || !data ? (
        <AdminEmptyState>Die Statistik konnte nicht geladen werden.</AdminEmptyState>
      ) : (
        <>
          {headline.length > 0 && (
            <AdminStatGrid>
              {headline.map(({ kind, value, partial }) => (
                <AdminStat
                  key={kind}
                  label={KIND_LABELS[kind]}
                  value={`${partial && kind !== 'active_users' ? 'mind. ' : ''}${formatCount(value)}`}
                  hint={
                    kind === 'active_users'
                      ? 'Spitze im Zeitraum'
                      : `${formatDate(data.from)} – ${formatDate(data.to)}`
                  }
                />
              ))}
            </AdminStatGrid>
          )}
          {series.length === 0 ? (
            <AdminEmptyState>Für diese Auswahl liegen keine Zahlen vor.</AdminEmptyState>
          ) : (
            <AdminPanel
              flush
              title="Nach Art"
              aside={
                <span className="text-grey-600 dark:text-grey-400">
                  {formatDate(data.from)} – {formatDate(data.to)}
                </span>
              }
            >
              <ul className="m-0 list-none p-0">
                {series.map((s) => (
                  <KindRow
                    key={`${source}-${s.kind}`}
                    series={s}
                    bucket={data.bucket}
                    minGroupSize={data.min_group_size}
                  />
                ))}
              </ul>
            </AdminPanel>
          )}
        </>
      )}
    </>
  );
}
