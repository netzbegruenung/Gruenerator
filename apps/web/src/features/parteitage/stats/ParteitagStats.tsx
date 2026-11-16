import {
  type ConventionArea,
  type ConventionSpeechPublic,
  type ConventionStatsV1,
  type SeatType,
} from '@gruenerator/contracts';

import './parteitag-colors.css';

import {
  applyFilters,
  countBy,
  listBlocks,
  type ParteitagFilters,
  resultPoints,
  schlussCounts,
} from './aggregate';
import { AreaLegend } from './AreaLegend';
import { FormulaBars } from './FormulaBars';
import { GroupCompare } from './GroupCompare';
import { KreisMap } from './KreisMap';
import { kvToAgs } from './kvToKreis';
import { ListStrip } from './ListStrip';
import { Methodik } from './Methodik';
import { ResultScatter } from './ResultScatter';
import { AREA_LABEL, AREA_ORDER, TEXT_CLASS } from './shared';
import { TopicBars } from './TopicBars';

type Props = {
  stats: ConventionStatsV1;
  speeches: ConventionSpeechPublic[];
  filters: ParteitagFilters;
  onFilter: (patch: Partial<ParteitagFilters>) => void;
};

const SEAT_LABEL: Record<SeatType, string> = {
  frauenplatz: 'Frauenplatz',
  offen: 'Offener Platz',
};
const SEAT_ORDER: SeatType[] = ['frauenplatz', 'offen'];

const CLEAR: ParteitagFilters = {
  area: null,
  seatType: null,
  topic: null,
  day: null,
  outcome: null,
  kreis: null,
};

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm ${TEXT_CLASS} ${pressed ? 'border-primary-600 ring-2 ring-primary-600' : 'border-grey-300 dark:border-grey-600'} bg-transparent`}
    >
      {children}
    </button>
  );
}

export function ParteitagStats({ stats, speeches, filters, onFilter }: Props) {
  const filtered = applyFilters(speeches, filters);
  const kreisCounts: Record<string, number> = {};
  for (const s of applyFilters(speeches, { ...filters, kreis: null })) {
    const ags = kvToAgs(s.kv);
    if (ags) kreisCounts[ags] = (kreisCounts[ags] ?? 0) + 1;
  }
  const days = [...new Map(speeches.map((s) => [s.day, s.dayLabel])).entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const hasKreisData = speeches.some((s) => kvToAgs(s.kv) !== null);
  const active = Object.values(filters).some((v) => v !== null);
  const toggleArea = (a: ConventionArea) => onFilter({ area: filters.area === a ? null : a });

  return (
    <section aria-labelledby="pt-stats" className="flex flex-col gap-md">
      <h2 id="pt-stats" className="m-0 text-lg font-semibold text-grey-800 dark:text-grey-100">
        Statistik
      </h2>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter">
        {AREA_ORDER.map((a) => (
          <Chip key={a} pressed={filters.area === a} onClick={() => toggleArea(a)}>
            {AREA_LABEL[a]}
          </Chip>
        ))}
        {SEAT_ORDER.map((t) => (
          <Chip
            key={t}
            pressed={filters.seatType === t}
            onClick={() => onFilter({ seatType: filters.seatType === t ? null : t })}
          >
            {SEAT_LABEL[t]}
          </Chip>
        ))}
        {days.map(([day, label]) => (
          <Chip
            key={day}
            pressed={filters.day === day}
            onClick={() => onFilter({ day: filters.day === day ? null : day })}
          >
            {label}
          </Chip>
        ))}
        <Chip
          pressed={filters.outcome === 'gewaehlt'}
          onClick={() => onFilter({ outcome: filters.outcome === 'gewaehlt' ? null : 'gewaehlt' })}
        >
          gewählt
        </Chip>
        <Chip
          pressed={filters.outcome === 'unterlegen'}
          onClick={() =>
            onFilter({ outcome: filters.outcome === 'unterlegen' ? null : 'unterlegen' })
          }
        >
          unterlegen
        </Chip>
      </div>

      <AreaLegend />

      <div className="grid gap-md md:grid-cols-2">
        <ListStrip blocks={listBlocks(filtered)} onArea={toggleArea} />
        <ResultScatter points={resultPoints(filtered)} onArea={toggleArea} />
      </div>

      {hasKreisData ? (
        <KreisMap
          counts={kreisCounts}
          selected={filters.kreis}
          onSelect={(kreis) => onFilter({ kreis })}
        />
      ) : null}

      <TopicBars
        counts={countBy(filtered, 'topic')}
        active={filters.topic}
        onTopic={(topic) => onFilter({ topic })}
      />
      <FormulaBars anrede={countBy(filtered, 'anrede')} schluss={schlussCounts(filtered)} />

      {active ? (
        <div className={`flex flex-wrap items-center gap-2 text-sm ${TEXT_CLASS}`}>
          <p className="m-0">Gilt für alle Reden, nicht für die Auswahl</p>
          <button
            type="button"
            onClick={() => onFilter(CLEAR)}
            className="rounded border border-grey-300 bg-transparent px-3 py-1 text-sm dark:border-grey-600"
          >
            Filter zurücksetzen
          </button>
        </div>
      ) : (
        <>
          <GroupCompare rows={stats.vergleichRaum} />
          <Signatures stats={stats} />
        </>
      )}

      <Methodik stats={stats} />
    </section>
  );
}

function Signatures({ stats }: { stats: ConventionStatsV1 }) {
  const entries = AREA_ORDER.flatMap((a) => {
    const words = stats.signaturRaum[a];
    return words && words.length > 0 ? [[a, words] as const] : [];
  });
  if (entries.length === 0) return null;
  return (
    <section className="flex flex-col gap-xs">
      <h3 className="m-0 text-sm font-medium text-grey-800 dark:text-grey-100">
        Typische Wörter je Herkunft
      </h3>
      <dl className={`m-0 text-sm ${TEXT_CLASS}`}>
        {entries.map(([a, words]) => (
          <div key={a} className="flex gap-2">
            <dt className="w-32 shrink-0 font-medium">{AREA_LABEL[a]}</dt>
            <dd className="m-0">
              {words
                .slice(0, 8)
                .map((w) => w[0])
                .join(', ')}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
