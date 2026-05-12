'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger, cn } from '@gruenerator/ui';
import { useAuiState } from '@assistant-ui/react';
import type {
  ReasoningMessagePartComponent,
  ReasoningGroupComponent,
} from '@assistant-ui/core/react';

type ReasoningVariant = 'outline' | 'ghost' | 'muted';

const variantClasses: Record<ReasoningVariant, string> = {
  outline: 'rounded-lg border border-border/60',
  ghost: '',
  muted: 'rounded-lg bg-muted/30',
};

type ReasoningRootContextValue = { variant: ReasoningVariant };
const ReasoningRootContext = createContext<ReasoningRootContextValue>({ variant: 'ghost' });

export function ReasoningRoot({
  variant = 'ghost',
  defaultOpen = false,
  children,
  className,
}: {
  variant?: ReasoningVariant;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const ctx = useMemo(() => ({ variant }), [variant]);
  return (
    <ReasoningRootContext.Provider value={ctx}>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className={cn('my-2 overflow-hidden', variantClasses[variant], className)}
      >
        {children}
      </Collapsible>
    </ReasoningRootContext.Provider>
  );
}

export function ReasoningTrigger({
  active = false,
  label,
  className,
}: {
  active?: boolean;
  label?: string;
  className?: string;
}) {
  const computedLabel = label ?? (active ? 'Denkt nach …' : 'Gedanken');
  return (
    <CollapsibleTrigger
      className={cn(
        'group/reasoning-trigger flex w-full items-center gap-2 px-1.5 py-1 text-xs font-medium text-foreground-muted transition-colors hover:text-foreground',
        className
      )}
    >
      <Sparkles className={cn('h-3.5 w-3.5', active && 'animate-pulse text-foreground')} />
      <span
        className={cn(
          'flex-1 text-left',
          active &&
            'animate-pulse bg-gradient-to-r from-foreground-muted via-foreground to-foreground-muted bg-[length:200%_100%] bg-clip-text text-transparent'
        )}
      >
        {computedLabel}
      </span>
      <ChevronDown
        className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]/reasoning-trigger:rotate-180"
        aria-hidden="true"
      />
    </CollapsibleTrigger>
  );
}

export function ReasoningContent({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  'aria-busy'?: boolean;
}) {
  const { variant } = useContext(ReasoningRootContext);
  return (
    <CollapsibleContent
      {...rest}
      className={cn(
        'relative max-h-64 overflow-y-auto overflow-x-hidden',
        variant === 'ghost' ? 'px-1.5 pb-1.5' : 'px-3 pb-3',
        className
      )}
    >
      {children}
      <ReasoningFade />
    </CollapsibleContent>
  );
}

export function ReasoningText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'whitespace-pre-wrap break-words pt-1 text-[12.5px] leading-relaxed text-foreground-muted',
        className
      )}
    >
      {children}
    </div>
  );
}

export function ReasoningFade({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none sticky bottom-0 -mt-6 h-6 bg-gradient-to-b from-transparent to-background',
        className
      )}
    />
  );
}

export const Reasoning: ReasoningMessagePartComponent = ({ text }) => (
  <div className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-foreground-muted">
    {text}
  </div>
);

export const ReasoningGroup: ReasoningGroupComponent = ({ children, startIndex, endIndex }) => {
  const isStreaming = useAuiState((s) => {
    if (s.message?.status?.type !== 'running') return false;
    const parts = s.message?.parts ?? [];
    const lastIndex = parts.length - 1;
    if (lastIndex < 0) return false;
    if (parts[lastIndex]?.type !== 'reasoning') return false;
    return lastIndex >= startIndex && lastIndex <= endIndex;
  });

  return (
    <ReasoningRoot variant="ghost" defaultOpen={isStreaming}>
      <ReasoningTrigger active={isStreaming} />
      <ReasoningContent aria-busy={isStreaming}>
        <ReasoningText>{children}</ReasoningText>
      </ReasoningContent>
    </ReasoningRoot>
  );
};
