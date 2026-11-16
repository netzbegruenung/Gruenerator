import { type ConventionStatsV1 } from '@gruenerator/contracts';

import { fmt, TEXT_CLASS } from './shared';

export function flag(p: number, q: number): 'belastbar' | 'Hinweis' | null {
  if (q < 0.05) return 'belastbar';
  if (p < 0.05) return 'Hinweis';
  return null;
}

export function GroupCompare({ rows }: { rows: ConventionStatsV1['vergleichRaum'] }) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-xs">
      <h3 className="m-0 text-sm font-medium text-grey-800 dark:text-grey-100">
        Vergleich kreisfreie Stadt und Kreis
      </h3>
      <div className="overflow-x-auto">
        <table className={`w-full border-collapse text-sm ${TEXT_CLASS}`}>
          <thead>
            <tr className="text-left">
              <th scope="col" className="p-1">
                Merkmal
              </th>
              <th scope="col" className="p-1">
                kreisfreie Stadt
              </th>
              <th scope="col" className="p-1">
                Kreis
              </th>
              <th scope="col" className="p-1">
                Einordnung
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.art}-${r.kategorie}`}>
                <th scope="row" className="p-1 text-left font-normal">
                  {r.kategorie}
                </th>
                <td className="p-1 tabular-nums">
                  {fmt(r.a, 2)} (n={r.na})
                </td>
                <td className="p-1 tabular-nums">
                  {fmt(r.b, 2)} (n={r.nb})
                </td>
                <td className="p-1">{flag(r.p, r.q) ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`m-0 text-xs ${TEXT_CLASS}`}>
        „Hinweis“: auffällig (p &lt; 0,05), nach Mehrfachvergleich nicht belastbar. „belastbar“:
        auch nach Korrektur auffällig (q &lt; 0,05).
      </p>
    </section>
  );
}
