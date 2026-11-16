import { type ConventionSpeechPublic } from '@gruenerator/contracts';
import { Input } from '@gruenerator/ui';
import { useMemo } from 'react';

import { applyFilters, type ParteitagFilters } from '../stats/aggregate';

export interface SpeechFilters {
  search: string;
  stats?: ParteitagFilters;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatResult(speech: ConventionSpeechPublic): string | null {
  if (speech.resultPercent !== null) {
    return `${speech.resultPercent.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
  }
  if (speech.contested && speech.elected === false) return 'unterlegen';
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
    .sort((a, b) => a.day.localeCompare(b.day) || a.listPlace - b.listPlace);
}

interface SpeechGridProps {
  speeches: ConventionSpeechPublic[];
  filters: SpeechFilters;
  onSelect: (speech: ConventionSpeechPublic) => void;
}

export function SpeechGrid({ speeches, filters, onSelect }: SpeechGridProps) {
  const visible = useMemo(() => filterSpeeches([...speeches], filters), [speeches, filters]);

  if (visible.length === 0) {
    return <p className="m-0 text-sm text-grey-500 dark:text-grey-400">Keine Reden gefunden.</p>;
  }

  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-md p-0">
      {visible.map((speech) => {
        const result = formatResult(speech);
        return (
          <li key={speech.id}>
            <button
              type="button"
              onClick={() => onSelect(speech)}
              className="flex w-full cursor-pointer flex-col gap-xs rounded-md border-0 bg-transparent p-0 text-left"
            >
              <img
                src={speech.posterUrl}
                alt=""
                loading="lazy"
                className="aspect-[9/16] w-full rounded-md bg-background-alt object-cover"
              />
              <span className="text-sm font-semibold text-foreground">
                Platz {speech.listPlace} · {speechName(speech)}
              </span>
              <span className="text-xs text-grey-500 dark:text-grey-400">
                {speech.kv} · {formatDuration(speech.durationS)}
                {result ? ` · ${result}` : ''}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function SpeechSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      type="search"
      aria-label="Reden durchsuchen"
      placeholder="Name oder Kreisverband"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-sm"
    />
  );
}
