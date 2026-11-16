import { type ConventionStatsV1 } from '@gruenerator/contracts';

import { AreaMark } from './AreaLegend';
import { AREA_COLOR, AREA_LABEL, CARD, fmt, TEXT_CLASS } from './shared';

type Row = ConventionStatsV1['vergleichRaum'][number];

export function flag(p: number, q: number): 'belastbar' | 'Hinweis' | null {
  if (q < 0.05) return 'belastbar';
  if (p < 0.05) return 'Hinweis';
  return null;
}

const VERDICT = {
  belastbar: 'Belastbarer Unterschied, auch nach Korrektur',
  Hinweis: 'Einzeln betrachtet auffällig, nach Korrektur nicht mehr',
  none: 'Kein belastbarer Unterschied',
} as const;

function pText(n: number): string {
  return n < 0.001 ? '< 0,001' : n.toLocaleString('de-DE', { maximumFractionDigits: 3 });
}

/** Jede Zeile hat ihre eigene Achse von 0 bis zum nächsten runden Wert über beiden Mittelwerten. */
function axisMax(a: number, b: number): number {
  const top = Math.max(Math.abs(a), Math.abs(b), 1e-9) * 1.15;
  const mag = 10 ** Math.floor(Math.log10(top));
  return Math.ceil(top / mag / 0.5) * 0.5 * mag;
}

function DotPlot({ row }: { row: Row }) {
  const max = axisMax(row.a, row.b);
  const pos = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  return (
    <div
      className="relative h-9 min-w-36"
      role="img"
      aria-label={`${AREA_LABEL.kreisfreie_stadt} ${fmt(row.a, 2)}, ${AREA_LABEL.kreis} ${fmt(row.b, 2)}, Achse 0 bis ${fmt(max, 2)}`}
    >
      <span className="absolute inset-x-0 top-[15px] h-px bg-grey-300 dark:bg-grey-600" />
      <span
        className="absolute top-[9px] -translate-x-1/2"
        style={{ left: pos(row.a), color: AREA_COLOR.kreisfreie_stadt }}
      >
        <AreaMark area="kreisfreie_stadt" size={13} />
      </span>
      <span
        className="absolute top-[9px] -translate-x-1/2"
        style={{ left: pos(row.b), color: AREA_COLOR.kreis }}
      >
        <AreaMark area="kreis" size={13} />
      </span>
      <span className="absolute bottom-0 left-0 text-[11px] text-foreground-muted tabular-nums">
        0
      </span>
      <span className="absolute right-0 bottom-0 text-[11px] text-foreground-muted tabular-nums">
        {fmt(max, 2)}
      </span>
    </div>
  );
}

export function GroupCompare({ rows }: { rows: ConventionStatsV1['vergleichRaum'] }) {
  if (rows.length === 0) return null;
  const na = rows[0]?.na;
  const nb = rows[0]?.nb;
  return (
    <section className={`flex flex-col gap-sm ${CARD}`} aria-labelledby="pt-compare">
      <div className="flex flex-col gap-1">
        <h3
          id="pt-compare"
          className="m-0 text-base font-semibold text-grey-800 dark:text-grey-100"
        >
          Vergleich kreisfreie Stadt und Kreis
        </h3>
        <p className={`m-0 text-sm ${TEXT_CLASS}`}>
          Punkt und Raute zeigen den Mittelwert der Gruppe. Jede Zeile hat ihre eigene Achse,
          Konfidenzintervalle liegen nicht vor.
        </p>
      </div>
      <ul className={`m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm ${TEXT_CLASS}`}>
        <li className="flex items-center gap-1.5">
          <AreaMark area="kreisfreie_stadt" />
          {AREA_LABEL.kreisfreie_stadt}
          {na !== undefined ? `, ${na} Reden` : ''}
        </li>
        <li className="flex items-center gap-1.5">
          <AreaMark area="kreis" />
          {AREA_LABEL.kreis}
          {nb !== undefined ? `, ${nb} Reden` : ''}
        </li>
      </ul>
      <div
        className="overflow-x-auto"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-reachable
        tabIndex={0}
        role="region"
        aria-label="Vergleichstabelle, horizontal scrollbar"
      >
        <table className={`w-full min-w-[44rem] border-collapse text-sm ${TEXT_CLASS}`}>
          <thead>
            <tr className="text-left text-xs">
              <th scope="col" className="p-1.5 font-medium">
                Merkmal
              </th>
              <th scope="col" className="p-1.5 font-medium">
                Mittelwerte im Vergleich
              </th>
              <th scope="col" className="p-1.5 text-right font-medium">
                kreisfreie Stadt
              </th>
              <th scope="col" className="p-1.5 text-right font-medium">
                Kreis
              </th>
              <th scope="col" className="p-1.5 text-right font-medium">
                p
              </th>
              <th scope="col" className="p-1.5 text-right font-medium">
                q (korrigiert)
              </th>
              <th scope="col" className="p-1.5 font-medium">
                Einordnung
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const f = flag(r.p, r.q);
              return (
                <tr
                  key={`${r.art}-${r.kategorie}`}
                  className="border-t border-grey-200 align-middle dark:border-grey-700"
                >
                  <th scope="row" className="p-1.5 text-left font-medium text-foreground">
                    {r.kategorie}
                  </th>
                  <td className="p-1.5">
                    <DotPlot row={r} />
                  </td>
                  <td className="p-1.5 text-right tabular-nums">
                    {fmt(r.a, 2)} <span className="text-xs">(n={r.na})</span>
                  </td>
                  <td className="p-1.5 text-right tabular-nums">
                    {fmt(r.b, 2)} <span className="text-xs">(n={r.nb})</span>
                  </td>
                  <td className="p-1.5 text-right tabular-nums">{pText(r.p)}</td>
                  <td className="p-1.5 text-right tabular-nums">{pText(r.q)}</td>
                  <td className="p-1.5 text-xs">{VERDICT[f ?? 'none']}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={`m-0 text-xs ${TEXT_CLASS}`}>
        p: Ergebnis des Einzelvergleichs je Merkmal. q: p-Wert nach Korrektur für
        Mehrfachvergleiche. „Hinweis“: auffällig (p &lt; 0,05), nach Korrektur nicht belastbar.
        „belastbar“: auch nach Korrektur auffällig (q &lt; 0,05).
      </p>
    </section>
  );
}
