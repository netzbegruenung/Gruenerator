import { type BriefingNewsList } from '@gruenerator/shared/monitor';
import { cn } from '@gruenerator/ui';

import { BriefingCard, type BriefingCardState } from './BriefingCard';

import { Bone } from '@/components/dashboard/Bone';
import { DASH_DISPLAY, DASH_FOCUS, DASH_MUTED } from '@/components/dashboard/dashboardStyles';
import { NewsMeta } from '@/components/dashboard/NewsMeta';

/** Eingeklappt zeigt jede Nachrichtenkarte so viele Meldungen. */
const COLLAPSED = 3;

const LIST = 'm-0 flex list-none flex-col gap-[26px] p-0';

/** Nachrichtenkarte: Quelle · Zeit über der Schlagzeile, eingeklappt drei, offen bis zu zehn. */
export function NewsCard({
  state,
  title,
  list,
  emptyText,
}: {
  state: BriefingCardState;
  title: string;
  list: BriefingNewsList;
  emptyText: string;
}) {
  const shown = state.open ? list.items : list.items.slice(0, COLLAPSED);

  return (
    <BriefingCard
      state={state}
      title={title}
      busy={list.pending}
      more={list.items.length > COLLAPSED}
    >
      {list.pending ? (
        <ul className={LIST} aria-hidden>
          {Array.from({ length: COLLAPSED }, (_, i) => (
            <li key={i} className="flex flex-col gap-2">
              <Bone className="h-3 w-40" />
              <Bone className="h-5 w-full" />
              <Bone className="h-5 w-2/3" />
            </li>
          ))}
        </ul>
      ) : shown.length === 0 ? (
        <p className={cn('m-0 text-[15px]', DASH_MUTED)}>{emptyText}</p>
      ) : (
        <ul className={LIST}>
          {shown.map((item) => (
            <li key={item.key}>
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex flex-col gap-1.5 rounded-md text-inherit no-underline hover:text-(--dash-mg) hover:no-underline',
                  DASH_FOCUS
                )}
              >
                <NewsMeta source={item.source} time={item.time} />
                <span
                  className={cn(
                    'text-[clamp(17px,1.7vw,19px)] font-bold leading-[1.3] text-pretty',
                    DASH_DISPLAY
                  )}
                >
                  {item.title}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </BriefingCard>
  );
}
