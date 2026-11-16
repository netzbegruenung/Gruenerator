import { type ConventionStatsV1 } from '@gruenerator/contracts';

import { TEXT_CLASS } from './shared';

export function Methodik({ stats }: { stats: Pick<ConventionStatsV1, 'methodik' | 'grenzen'> }) {
  return (
    <details className={`text-sm ${TEXT_CLASS}`}>
      <summary className="cursor-pointer font-medium">Methodik und Grenzen</summary>
      <div className="mt-2 flex flex-col gap-2">
        {stats.methodik.map((m) => (
          <div key={m.titel}>
            <h4 className="m-0 text-sm font-medium">{m.titel}</h4>
            <p className="m-0">{m.text}</p>
          </div>
        ))}
        {stats.grenzen && (
          <div>
            <h4 className="m-0 text-sm font-medium">Grenzen</h4>
            <p className="m-0">{stats.grenzen}</p>
          </div>
        )}
      </div>
    </details>
  );
}
