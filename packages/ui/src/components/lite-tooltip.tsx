import * as React from 'react';

import { cn } from '../lib/cn';

type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

interface LiteTooltipProps {
  label: string;
  side?: TooltipSide;
  children: React.ReactElement;
  className?: string;
}

const sideClasses: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
};

function LiteTooltip({ label, side = 'bottom', children, className }: LiteTooltipProps) {
  const [show, setShow] = React.useState(false);

  return (
    <div
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          role="tooltip"
          className={cn(
            'absolute z-50 whitespace-nowrap rounded-md px-2 py-1 text-xs',
            'bg-foreground-heading text-background-pure shadow-sm',
            'animate-in fade-in-0 zoom-in-95 duration-100',
            'pointer-events-none',
            sideClasses[side]
          )}
        >
          {label}
        </div>
      )}
    </div>
  );
}

export { LiteTooltip, type LiteTooltipProps };
