import { type ConventionSpeechPublic, type SeatType } from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';
import { useId, useMemo } from 'react';
import { HiCheck, HiChevronDown, HiMagnifyingGlass } from 'react-icons/hi2';
import { Link } from 'react-router-dom';

import { FilterChip, GalleryCountRow, galleryCard } from '../../../components/common/Gallery/parts';
import { cn } from '../../../utils/cn';
import { applyFilters, type ParteitagFilters } from '../stats/aggregate';

export interface SpeechToolbarFilters {
  search: string;
  /** ISO day (`ConventionSpeechPublic.day`). */
  day: string | null;
  kv: string | null;
  seatType: SeatType | null;
}

export interface SpeechFilters extends Partial<SpeechToolbarFilters> {
  search: string;
  stats?: ParteitagFilters;
}

export const SEAT_LABEL: Record<SeatType, string> = {
  frauenplatz: 'Frauenplatz',
  offen: 'offener Platz',
};

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Nur für Gewählte: wer nicht gewählt wurde, trägt keine Zahl und kein Etikett. */
export function formatResult(speech: ConventionSpeechPublic): string | null {
  if (speech.elected === true && speech.resultPercent !== null) {
    return `${speech.resultPercent.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
  }
  return null;
}

export function speechName(speech: ConventionSpeechPublic): string {
  return `${speech.firstName} ${speech.lastName}`.trim();
}

export function filterSpeeches(
  speeches: ConventionSpeechPublic[],
  filters: SpeechFilters
): ConventionSpeechPublic[] {
  const q = filters.search.trim().toLowerCase();
  const base = filters.stats ? applyFilters(speeches, filters.stats) : speeches;
  return base
    .filter((s) => !q || `${speechName(s)} ${s.kv}`.toLowerCase().includes(q))
    .filter((s) => !filters.day || s.day === filters.day)
    .filter((s) => !filters.kv || s.kv === filters.kv)
    .filter((s) => !filters.seatType || s.seatType === filters.seatType)
    .sort((a, b) => a.listPlace - b.listPlace || a.day.localeCompare(b.day));
}

const selectClass =
  'h-11 w-full min-w-0 cursor-pointer appearance-none rounded-sm border-0 bg-input-bg py-sm pr-9 pl-sm text-sm text-input-text outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-w-0 flex-1 basis-44">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectClass}
      >
        {children}
      </select>
      <HiChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-foreground-muted"
      />
    </div>
  );
}

interface SpeechFilterBarProps {
  speeches: ConventionSpeechPublic[];
  value: SpeechToolbarFilters;
  onChange: (next: SpeechToolbarFilters) => void;
  stats: ParteitagFilters;
  onResetStats: () => void;
}

export function SpeechFilterBar({
  speeches,
  value,
  onChange,
  stats,
  onResetStats,
}: SpeechFilterBarProps) {
  const searchId = useId();
  const days = useMemo(
    () =>
      [...new Map(speeches.map((s) => [s.day, s.dayLabel])).entries()].sort((a, b) =>
        a[0].localeCompare(b[0])
      ),
    [speeches]
  );
  const kvs = useMemo(
    () => [...new Set(speeches.map((s) => s.kv))].sort((a, b) => a.localeCompare(b, 'de')),
    [speeches]
  );
  const statsActive = Object.values(stats).some((v) => v !== null);
  const count = useMemo(
    () => filterSpeeches(speeches, { ...value, stats }).length,
    [speeches, value, stats]
  );
  const toolbarActive = value.search !== '' || value.day || value.kv || value.seatType;
  const set = (patch: Partial<SpeechToolbarFilters>) => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-col gap-sm">
      <div
        role="search"
        className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-sm bg-background px-1 py-sm"
      >
        <div className="relative min-w-0 flex-[3_1_16rem]">
          <label htmlFor={searchId} className="sr-only">
            Reden durchsuchen
          </label>
          <HiMagnifyingGlass
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-foreground-muted"
          />
          <input
            id={searchId}
            type="search"
            placeholder="Name oder Kreisverband suchen"
            value={value.search}
            onChange={(e) => set({ search: e.target.value })}
            className="h-11 w-full min-w-0 rounded-sm border-0 bg-input-bg pr-sm pl-9 text-sm text-input-text outline-none placeholder:text-foreground-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>
        <div
          role="group"
          aria-label="Tag"
          className="flex h-11 items-center gap-0.5 rounded-sm bg-input-bg p-1"
        >
          {[[null, 'Alle Tage'] as const, ...days.map(([d, l]) => [d, l] as const)].map(
            ([day, label]) => (
              <button
                key={day ?? 'all'}
                type="button"
                aria-pressed={value.day === day}
                onClick={() => set({ day })}
                className={cn(
                  'h-full cursor-pointer rounded-xs border-0 px-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  value.day === day
                    ? 'bg-background text-foreground shadow-sm'
                    : 'bg-transparent text-foreground-muted hover:text-foreground'
                )}
              >
                {day === null ? (
                  label
                ) : (
                  <>
                    <span aria-hidden="true">{label.slice(0, 2)}</span>
                    <span className="sr-only">{label}</span>
                  </>
                )}
              </button>
            )
          )}
        </div>
        <SelectField
          label="Kreisverband"
          value={value.kv ?? ''}
          onChange={(kv) => set({ kv: kv || null })}
        >
          <option value="">Alle Kreisverbände</option>
          {kvs.map((kv) => (
            <option key={kv} value={kv}>
              {kv}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Platzart"
          value={value.seatType ?? ''}
          onChange={(seatType) => set({ seatType: (seatType || null) as SeatType | null })}
        >
          <option value="">Alle Platzarten</option>
          <option value="frauenplatz">Frauenplatz</option>
          <option value="offen">Offener Platz</option>
        </SelectField>
      </div>
      <GalleryCountRow
        count={<span aria-live="polite">{count === 1 ? '1 Rede' : `${count} Reden`}</span>}
        onReset={
          toolbarActive || statsActive
            ? () => {
                onChange({ search: '', day: null, kv: null, seatType: null });
                if (statsActive) onResetStats();
              }
            : undefined
        }
      >
        {statsActive ? (
          <FilterChip label="Filter aus der Statistik" onRemove={onResetStats} />
        ) : null}
      </GalleryCountRow>
    </div>
  );
}

interface SpeechGridProps {
  speeches: ConventionSpeechPublic[];
  filters: SpeechFilters;
  onSelect: (speech: ConventionSpeechPublic) => void;
}

function SpeechCard({
  speech,
  onSelect,
}: {
  speech: ConventionSpeechPublic;
  onSelect: (speech: ConventionSpeechPublic) => void;
}) {
  const result = formatResult(speech);
  const name = speechName(speech);
  const id = encodeURIComponent(speech.id);
  const actionClass =
    'relative z-[2] h-9 w-full max-[480px]:h-11 max-[480px]:min-w-0 max-[480px]:flex-1 max-[480px]:px-2';
  return (
    <article
      className={cn(
        galleryCard,
        'relative w-full cursor-default has-[button:focus-visible]:ring-[3px] has-[button:focus-visible]:ring-ring/50',
        'max-[480px]:grid max-[480px]:grid-cols-[5.5rem_minmax(0,1fr)] max-[480px]:gap-x-3 max-[480px]:gap-y-3 max-[480px]:p-3'
      )}
    >
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-background-alt max-[480px]:rounded-md">
        <img src={speech.posterUrl} alt="" loading="lazy" className="size-full object-cover" />
        <span className="absolute top-2.5 left-2.5 rounded-md border border-white/[0.16] bg-[#0f1210]/60 px-2 py-0.5 text-xs text-white backdrop-blur-sm max-[480px]:top-1.5 max-[480px]:left-1.5 max-[480px]:px-1.5">
          Platz{' '}
          <strong className="text-base tabular-nums max-[480px]:text-sm">{speech.listPlace}</strong>
        </span>
        <span className="absolute right-2.5 bottom-2.5 rounded-md bg-[#0f1210]/60 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums backdrop-blur-sm max-[480px]:right-1.5 max-[480px]:bottom-1.5">
          {formatDuration(speech.durationS)}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 px-3 pt-3 max-[480px]:p-0">
        <h2 className="m-0 text-base leading-snug font-semibold text-foreground">
          <button
            type="button"
            onClick={() => onSelect(speech)}
            className="cursor-pointer border-0 bg-transparent p-0 text-left font-[inherit] text-inherit outline-none after:absolute after:inset-0 after:content-['']"
          >
            {name}
          </button>
        </h2>
        <p className="m-0 text-sm text-foreground-muted">{speech.kv}</p>
        <p className="m-0 text-sm text-foreground-muted">
          Platz {speech.listPlace}, {SEAT_LABEL[speech.seatType]}
        </p>
        <p className="m-0 text-sm text-foreground-muted tabular-nums">
          {speech.dayLabel}, {formatDuration(speech.durationS)} Min.
        </p>
        {result ? (
          <p className="m-0 flex items-center gap-1 text-sm font-medium text-primary-700 dark:text-primary-300">
            <HiCheck aria-hidden="true" className="shrink-0" />
            Gewählt mit {result}
          </p>
        ) : null}
        {speech.contested ? (
          <span className="w-fit rounded-full border border-grey-300 px-2 py-0.5 text-xs text-foreground-muted dark:border-grey-600">
            Kampfkandidatur
          </span>
        ) : null}
      </div>
      <div className="mt-auto flex flex-col gap-2 p-3 max-[480px]:col-span-2 max-[480px]:flex-row max-[480px]:p-0">
        <Button asChild variant="brand" size="brand-sm" className={actionClass}>
          <Link
            to={`/studio/videoeditor?parteitagRede=${id}`}
            aria-label={`In Editor laden: ${name}`}
          >
            In Editor laden
          </Link>
        </Button>
        <Button asChild variant="brand-outline" size="brand-sm" className={actionClass}>
          <Link to={`/studio/video?parteitagRede=${id}`} aria-label={`Nur untertiteln: ${name}`}>
            Nur untertiteln
          </Link>
        </Button>
      </div>
    </article>
  );
}

export function SpeechGrid({ speeches, filters, onSelect }: SpeechGridProps) {
  const visible = useMemo(() => filterSpeeches([...speeches], filters), [speeches, filters]);

  if (visible.length === 0) {
    return <p className="m-0 text-sm text-foreground-muted">Keine Reden gefunden.</p>;
  }

  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] gap-md p-0 max-[480px]:grid-cols-1">
      {visible.map((speech) => (
        <li key={speech.id} className="flex">
          <SpeechCard speech={speech} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}
