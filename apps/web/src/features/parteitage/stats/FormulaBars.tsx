import { CARD, TEXT_CLASS } from './shared';

function Bars({ title, counts }: { title: string; counts: [string, number][] }) {
  if (counts.length === 0) return null;
  const rows = counts.slice(0, 8);
  const max = Math.max(...rows.map(([, n]) => n));
  return (
    <section className={`flex flex-col gap-xs ${CARD}`}>
      <h3 className="m-0 text-base font-semibold text-grey-800 dark:text-grey-100">{title}</h3>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {rows.map(([label, n]) => (
          <li key={label} className={`flex items-center gap-2 text-sm ${TEXT_CLASS}`}>
            <span className="w-32 shrink-0 truncate">{label}</span>
            <span className="h-3 flex-1 rounded bg-grey-100 dark:bg-grey-800" aria-hidden="true">
              <span
                className="block h-full rounded bg-grey-500"
                style={{ width: `${(n / max) * 100}%` }}
              />
            </span>
            <span className="w-8 text-right tabular-nums">{n}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FormulaBars({
  anrede,
  schluss,
}: {
  anrede: [string, number][];
  schluss: [string, number][];
}) {
  return (
    <div className="grid gap-md md:grid-cols-2">
      <Bars title="Anreden" counts={anrede} />
      <Bars title="Schlussformeln" counts={schluss} />
    </div>
  );
}
