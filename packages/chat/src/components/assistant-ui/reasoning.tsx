'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@gruenerator/ui';
import type {
  ReasoningMessagePartComponent,
  ReasoningGroupComponent,
} from '@assistant-ui/core/react';

export const Reasoning: ReasoningMessagePartComponent = ({ text }) => (
  <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground-muted">
    {text}
  </div>
);

export const ReasoningGroup: ReasoningGroupComponent = ({ children }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border/60 bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:bg-muted/50 hover:text-foreground"
        aria-expanded={open}
      >
        <span>Gedanken</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
};
