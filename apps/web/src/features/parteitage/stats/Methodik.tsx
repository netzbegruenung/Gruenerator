import { type ConventionStatsV1 } from '@gruenerator/contracts';

import { CARD, TEXT_CLASS } from './shared';

export function Methodik({ stats }: { stats: Pick<ConventionStatsV1, 'methodik' | 'grenzen'> }) {
  if (stats.methodik.length === 0 && !stats.grenzen) return null;
  return (
    <div className="grid items-start gap-md md:grid-cols-2">
      {stats.methodik.length > 0 ? (
        <section className={`flex flex-col gap-sm ${CARD}`} aria-labelledby="pt-methodik">
          <h3
            id="pt-methodik"
            className="m-0 text-base font-semibold text-grey-800 dark:text-grey-100"
          >
            Methodik
          </h3>
          <ul
            className={`m-0 flex list-disc flex-col gap-2 pl-5 text-sm marker:text-primary-600 ${TEXT_CLASS}`}
          >
            {stats.methodik.map((m) => (
              <li key={m.titel}>
                <strong className="font-medium text-foreground">{m.titel}</strong>
                <span className="block">{m.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {stats.grenzen ? (
        <section className={`flex flex-col gap-sm ${CARD}`} aria-labelledby="pt-grenzen">
          <h3
            id="pt-grenzen"
            className="m-0 text-base font-semibold text-grey-800 dark:text-grey-100"
          >
            Grenzen
          </h3>
          <p className={`m-0 text-sm ${TEXT_CLASS}`}>{stats.grenzen}</p>
        </section>
      ) : null}
    </div>
  );
}
