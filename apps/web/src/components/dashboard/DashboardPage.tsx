import { cn } from '@gruenerator/ui';
import { type ReactNode } from 'react';

import { DASH_DISPLAY, DASH_HEADING } from './dashboardStyles';

/** Überschrift einer Dashboard-Seite („Briefing", „Umfragen"). */
export const DASH_PAGE_TITLE = cn(
  'm-0 text-[clamp(38px,7vw,52px)] font-bold leading-none tracking-[-0.02em]',
  DASH_DISPLAY,
  DASH_HEADING
);

/**
 * Seitenfläche der eigenständigen Dashboard-Seiten (/briefing, /umfragen):
 * getönter Grund, 1440 px breit, Abstände aus dem Entwurf „Puls".
 * `shrink-0`: als Flex-Kind eines scrollenden Containers stauchte `min-h-dvh`
 * die Fläche sonst auf Fensterhöhe.
 */
export function DashboardPage({
  children,
  'aria-busy': busy,
}: {
  children: ReactNode;
  'aria-busy'?: boolean;
}) {
  return (
    <div
      className="dashboard-surface min-h-dvh shrink-0 bg-(--dash-page) text-foreground"
      aria-busy={busy}
    >
      <div className="mx-auto flex max-w-[1440px] flex-col gap-[clamp(20px,3vw,28px)] px-[clamp(16px,4vw,40px)] pb-16 pt-[clamp(20px,5vw,44px)]">
        {children}
      </div>
    </div>
  );
}
