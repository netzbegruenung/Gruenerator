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
  ToggleGroup,
  ToggleGroupItem,
} from '@gruenerator/ui';
import { useId, useState } from 'react';

import {
  DOCUMENT_TYPE_LABELS,
  USAGE_TRACKED_SINCE,
  formatCount,
  formatDate,
} from '../../../utils/usageFormat';
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
  { id: '30d', label: 'Letzte 30 Tage', buckets: ['day', 'week'] },
  { id: '12m', label: 'Letzte 12 Monate', buckets: ['week', 'month'] },
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
            className={v === null ? 'fill-grey-300 dark:fill-grey-600' : 'fill-primary-500'}
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

function KindDetail({ series, bucket, minGroupSize }: RowProps) {
  const [subtype, setSubtype] = useState<string | null>(null);
  const subtypes = [
    ...new Set(series.points.flatMap((point) => point.by_subtype.map((s) => s.subtype))),
  ];
  const note = KIND_NOTES[series.kind];

  return (
    <div className="flex flex-col gap-sm pb-md pl-md">
      {note && <p className="m-0 text-sm text-grey-500 dark:text-grey-400">{note}</p>}
      {subtypes.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-xs p-0">
          <li>
            <button
              type="button"
              onClick={() => setSubtype(null)}
              aria-pressed={subtype === null}
              className="rounded-full border border-grey-200 px-sm py-1 text-sm aria-pressed:bg-primary-100 aria-pressed:border-primary-500 dark:border-grey-700 dark:aria-pressed:bg-primary-900"
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
                  className="rounded-full border border-grey-200 px-sm py-1 text-sm aria-pressed:bg-primary-100 aria-pressed:border-primary-500 dark:border-grey-700 dark:aria-pressed:bg-primary-900"
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
          <tr className="text-left text-grey-500 dark:text-grey-400">
            <th className="py-1 font-normal">{BUCKET_LABELS[bucket]}</th>
            <th className="py-1 text-right font-normal">
              {subtype === null ? 'Anzahl' : subtypeLabel(series.kind, subtype)}
            </th>
          </tr>
        </thead>
        <tbody>
          {[...series.points].reverse().map((point) => (
            <tr key={point.bucket} className="border-t border-grey-100 dark:border-grey-800">
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
  return (
    <li className="border-t border-grey-200 first:border-t-0 dark:border-grey-700">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={detailId}
        className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-md py-sm text-left"
      >
        <span className="font-medium text-foreground-heading">{KIND_LABELS[series.kind]}</span>
        <span className="tabular-nums">
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

export default function StatisticsTab() {
  const [range, setRange] = useState<RangeId>('12m');
  const [bucket, setBucket] = useState<AdminStatsBucket>('month');
  const [locale, setLocale] = useState<AdminStatsLocale>('all');
  const [source, setSource] = useState<AdminStatsSource>('live');
  const rangeId = useId();
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

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-wrap items-end gap-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor={rangeId} className="text-xs text-grey-500 dark:text-grey-400">
            Zeitraum
          </label>
          <Select value={range} onValueChange={(v) => setRange(v as RangeId)}>
            <SelectTrigger id={rangeId} className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={localeId} className="text-xs text-grey-500 dark:text-grey-400">
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
        <ToggleGroup
          type="single"
          value={effectiveBucket}
          onValueChange={(v) => v && setBucket(v as AdminStatsBucket)}
          aria-label="Raster"
          variant="outline"
        >
          {(['day', 'week', 'month'] as const).map((b) => (
            <ToggleGroupItem key={b} value={b} disabled={!allowed.includes(b)}>
              {BUCKET_LABELS[b]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          type="single"
          value={source}
          onValueChange={(v) => v && setSource(v as AdminStatsSource)}
          aria-label="Quelle"
          variant="outline"
        >
          <ToggleGroupItem value="live">Bestand</ToggleGroupItem>
          <ToggleGroupItem value="counter">Zähler</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <p className="m-0 text-sm text-grey-500 dark:text-grey-400">
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
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : isError || !data ? (
        <p className="py-lg text-center text-sm text-grey-500 dark:text-grey-400">
          Die Statistik konnte nicht geladen werden.
        </p>
      ) : (
        <>
          <ul className="m-0 list-none rounded-lg border border-grey-200 px-md py-0 dark:border-grey-700">
            {series.map((s) => (
              <KindRow
                key={`${source}-${s.kind}`}
                series={s}
                bucket={data.bucket}
                minGroupSize={data.min_group_size}
              />
            ))}
          </ul>
          <p className="m-0 text-xs text-grey-500 dark:text-grey-400">
            {formatDate(data.from)} – {formatDate(data.to)} · Stand{' '}
            {new Date(data.generated_at).toLocaleTimeString('de-DE', {
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            · bis zu 15 Minuten verzögert
          </p>
        </>
      )}
    </div>
  );
}
