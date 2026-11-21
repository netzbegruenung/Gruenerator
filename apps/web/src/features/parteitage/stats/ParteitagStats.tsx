import {
  type ConventionArea,
  type ConventionSpeechPublic,
  type ConventionStatsPublic,
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
import { AreaLegend, AreaMark } from './AreaLegend';
import { FormulaBars } from './FormulaBars';
import { flag, GroupCompare } from './GroupCompare';
import { KreisMap } from './KreisMap';
import { kvToAgs } from './kvToKreis';
import { ListStrip } from './ListStrip';
import { Methodik } from './Methodik';
import { ResultScatter } from './ResultScatter';
import { AREA_LABEL, AREA_ORDER, CARD, TEXT_CLASS } from './shared';
import { TopicBars } from './TopicBars';

type Props = {
  stats: ConventionStatsPublic;
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
      className={`min-h-9 cursor-pointer rounded-full border px-3 py-1 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${TEXT_CLASS} ${pressed ? 'border-primary-600 bg-primary-500/10 ring-2 ring-primary-600' : 'border-grey-300 bg-transparent hover:bg-background-alt dark:border-grey-600'}`}
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
      <h2 id="pt-stats" className="sr-only">
        Statistik
      </h2>

      <Finding rows={stats.vergleichRaum} />

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

      <div className="grid items-start gap-md lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <TopicBars
          counts={countBy(filtered, 'topic')}
          active={filters.topic}
          onTopic={(topic) => onFilter({ topic })}
        />
        <FormulaBars anrede={countBy(filtered, 'anrede')} schluss={schlussCounts(filtered)} />
      </div>

      {active ? (
        <div className={`flex flex-wrap items-center gap-2 text-sm ${TEXT_CLASS}`}>
          <p className="m-0">Gilt für alle Reden, nicht für die Auswahl</p>
          <button
            type="button"
            onClick={() => onFilter(CLEAR)}
            className="min-h-9 cursor-pointer rounded-full border border-grey-300 bg-transparent px-3 py-1 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:border-grey-600"
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

function Finding({ rows }: { rows: ConventionStatsPublic['vergleichRaum'] }) {
  if (rows.length === 0) return null;
  const robust = rows.filter((r) => flag(r.p, r.q) === 'belastbar').length;
  const hints = rows.filter((r) => flag(r.p, r.q) === 'Hinweis').length;
  const headline =
    robust === 0
      ? 'Reden aus kreisfreien Städten und aus Kreisen unterscheiden sich nicht belastbar.'
      : `Reden aus kreisfreien Städten und aus Kreisen unterscheiden sich in ${robust} von ${rows.length} Merkmalen belastbar.`;
  const detail =
    robust === 0
      ? `Verglichen wurden ${rows.length} Merkmale.${hints > 0 ? ` ${hints} fallen einzeln betrachtet auf, keines hält der Korrektur für Mehrfachvergleiche stand.` : ' Keines fällt auf.'}`
      : `Verglichen wurden ${rows.length} Merkmale; ${robust} halten der Korrektur für Mehrfachvergleiche stand.`;
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-primary-500/10 p-md">
      <p className="m-0 text-base font-semibold text-foreground-heading">{headline}</p>
      <p className={`m-0 text-sm ${TEXT_CLASS}`}>
        {detail} Ausgewertet werden nur Gruppen von Reden, nie einzelne Personen.
      </p>
    </div>
  );
}

function Signatures({ stats }: { stats: ConventionStatsPublic }) {
  const entries = AREA_ORDER.flatMap((a) => {
    const words = stats.signaturRaum[a];
    return words && words.length > 0 ? [[a, words] as const] : [];
  });
  if (entries.length === 0) return null;
  return (
    <section className={`flex flex-col gap-sm ${CARD}`} aria-labelledby="pt-signatur">
      <div className="flex flex-col gap-1">
        <h3
          id="pt-signatur"
          className="m-0 text-base font-semibold text-grey-800 dark:text-grey-100"
        >
          Typische Wörter je Herkunft
        </h3>
        <p className={`m-0 text-sm ${TEXT_CLASS}`}>
          Beschreibend, nicht getestet: Die Listen zeigen Wortwahl, keine Wirkung.
        </p>
      </div>
      <dl className={`m-0 flex flex-col gap-2 text-sm ${TEXT_CLASS}`}>
        {entries.map(([a, words]) => (
          <div key={a} className="flex flex-wrap gap-x-3 gap-y-1">
            <dt className="flex w-36 shrink-0 items-center gap-1.5 font-medium text-foreground">
              <AreaMark area={a} />
              {AREA_LABEL[a]}
            </dt>
            <dd className="m-0 min-w-0 flex-1 basis-48">
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
