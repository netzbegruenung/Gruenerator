import { cn } from '@gruenerator/ui';
import { type ReactNode } from 'react';

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** Calendar tile with day and month of an ISO date, or an icon for undated trips. */
export function DatumKachel({
  iso,
  icon,
  klein = false,
}: {
  iso?: string;
  icon?: ReactNode;
  klein?: boolean;
}) {
  const tag = iso ? Number(iso.slice(8, 10)) : null;
  const monat = iso ? MONATE[Number(iso.slice(5, 7)) - 1] : null;
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 flex-col items-center justify-center gap-0.5 bg-grey-50 text-primary-800 dark:bg-grey-800 dark:text-primary-200',
        klein ? 'h-12 w-[46px] rounded-xl' : 'h-[68px] w-16 rounded-xl'
      )}
    >
      {tag !== null ? (
        <>
          <span
            className={cn(
              'font-[Raleway,sans-serif] leading-none font-extrabold',
              klein ? 'text-[19px]' : 'text-[26px]'
            )}
          >
            {tag}
          </span>
          <span
            className={cn(
              'font-bold tracking-[.06em] uppercase',
              klein ? 'text-[10px]' : 'text-[11px]'
            )}
          >
            {monat}
          </span>
        </>
      ) : (
        icon
      )}
    </span>
  );
}
