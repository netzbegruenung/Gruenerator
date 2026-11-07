import { cn } from '@gruenerator/ui';

import { DASH_MUTED } from './dashboardStyles';

/** Absender und Zeit über einer Schlagzeile: „GRÜNE BAYERN · vor 14 Std." (/wissen, /briefing). */
export function NewsMeta({ source, time }: { source: string; time: string }) {
  return (
    <span className="text-[13px] font-bold uppercase tracking-[0.04em] text-(--dash-mg-ink)">
      {source}
      {time && (
        <span className={cn('font-normal normal-case tracking-normal', DASH_MUTED)}>
          {' · '}
          {time}
        </span>
      )}
    </span>
  );
}
