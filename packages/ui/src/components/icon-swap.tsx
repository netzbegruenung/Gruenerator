import { type ReactNode } from 'react';

import { cn } from '../lib/cn';

// Both icons stay mounted in one grid cell so the swap can cross-fade instead
// of teleporting. `scale-*` sets the CSS `scale` property in Tailwind v4,
// hence `scale` (not `transform`) in the transition list.
const layer =
  '[grid-area:1/1] transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]';
const hidden = 'opacity-0 scale-50 blur-[2px]';

/** Cross-fades between two icons, e.g. Copy → Check after copying. */
function IconSwap({
  swapped,
  from,
  to,
  className,
}: {
  swapped: boolean;
  from: ReactNode;
  to: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('inline-grid place-items-center', className)} aria-hidden="true">
      <span className={cn(layer, 'inline-flex', swapped && hidden)}>{from}</span>
      <span className={cn(layer, 'inline-flex', !swapped && hidden)}>{to}</span>
    </span>
  );
}

export { IconSwap };
