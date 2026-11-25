import { type PollData } from '@gruenerator/contracts';
import { formatPollDate, isGruene, pct } from '@gruenerator/shared/monitor';
import { cn } from '@gruenerator/ui';

import { BriefingCard, type BriefingCardState } from './BriefingCard';

import { Bone } from '@/components/dashboard/Bone';
import { DASH_MUTED } from '@/components/dashboard/dashboardStyles';

const COLLAPSED = 5;

/**
 * Umfrage im Land: der gewichtete PolitPro-Schnitt als Balken, die Grünen im
 * Akzent. Steht in der Land-Ansicht an der Stelle der X-Trends, die es nur
 * bundesweit gibt.
 */
export function PollCard({
  state,
  poll,
  pending,
}: {
  state: BriefingCardState;
  poll: PollData | null;
  pending: boolean;
}) {
  const parties = Object.entries(poll?.average ?? {})
    .filter(([party]) => party !== 'Sonstige')
    .sort((a, b) => b[1] - a[1]);
  const shown = state.open ? parties : parties.slice(0, COLLAPSED);
  const max = parties[0]?.[1] || 1;
  const latest = poll?.polls[0];

  return (
    <BriefingCard state={state} title="Umfrage" busy={pending} more={parties.length > COLLAPSED}>
      {pending ? (
        <div aria-hidden className="flex flex-col gap-4">
          {['w-full', 'w-4/5', 'w-3/5', 'w-1/2', 'w-1/4'].map((w) => (
            <Bone key={w} className={cn('h-4', w)} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className={cn('m-0 text-[15px]', DASH_MUTED)}>
          Für dieses Land gibt es gerade keine Umfragen.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {shown.map(([party, value]) => {
              const gruene = isGruene(party);
              return (
                <li
                  key={party}
                  className="grid grid-cols-[minmax(0,96px)_minmax(0,1fr)_5ch] items-center gap-3 text-[15px]"
                >
                  <span
                    className={cn(gruene ? 'font-bold text-(--dash-mg-ink)' : 'text-foreground')}
                  >
                    {party}
                  </span>
                  <span aria-hidden className="h-1.5 rounded-full bg-border">
                    <span
                      className={cn(
                        'block h-full rounded-full',
                        gruene ? 'bg-(--dash-mg)' : 'bg-muted-foreground'
                      )}
                      style={{ width: `${Math.round((value / max) * 100)}%` }}
                    />
                  </span>
                  <span
                    className={cn(
                      'text-right tabular-nums',
                      gruene ? 'font-bold text-(--dash-mg-ink)' : DASH_MUTED
                    )}
                  >
                    {pct(value)}
                  </span>
                </li>
              );
            })}
          </ul>
          {latest && (
            <p className={cn('m-0 text-[13px]', DASH_MUTED)}>
              Schnitt aus {poll.polls.length} {poll.polls.length === 1 ? 'Umfrage' : 'Umfragen'} ·
              zuletzt {latest.institute}, {formatPollDate(latest.date)}
            </p>
          )}
        </div>
      )}
    </BriefingCard>
  );
}
