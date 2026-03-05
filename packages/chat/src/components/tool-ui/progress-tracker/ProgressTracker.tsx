'use client';

import { memo } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { ProgressStep } from '../../../hooks/useChatGraphStream';

interface ProgressTrackerComponentProps {
  steps: ProgressStep[];
  agentColor?: string;
  totalTimeMs?: number;
}

export const ProgressTracker = memo(function ProgressTracker({
  steps,
  agentColor = '#316049',
  totalTimeMs,
}: ProgressTrackerComponentProps) {
  if (steps.length === 0) return null;

  const allComplete = steps.every((s) => s.status === 'completed');

  if (allComplete) {
    return (
      <div className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-foreground-muted bg-primary/5">
        <Check className="h-3.5 w-3.5 text-primary" />
        <span>{steps.map((s) => s.label).join(' \u2192 ')}</span>
        {totalTimeMs != null && (
          <span className="ml-auto text-[10px] tabular-nums">
            {(totalTimeMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg px-3 py-2 bg-primary/5">
      {steps.map((step, i) => (
        <div key={step.stage} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-foreground-muted text-xs">&rarr;</span>}
          <StepIcon status={step.status} agentColor={agentColor} />
          <span
            className={cn(
              'text-xs whitespace-nowrap',
              step.status === 'in-progress' && 'font-medium text-foreground',
              step.status === 'completed' && 'text-foreground-muted',
              step.status === 'pending' && 'text-foreground-muted/60',
              step.status === 'failed' && 'text-error font-medium'
            )}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
});

const StepIcon = memo(function StepIcon({
  status,
  agentColor,
}: {
  status: ProgressStep['status'];
  agentColor: string;
}) {
  switch (status) {
    case 'completed':
      return (
        <div
          className="flex h-4 w-4 items-center justify-center rounded-full"
          style={{ backgroundColor: agentColor }}
        >
          <Check className="h-2.5 w-2.5 text-white" />
        </div>
      );
    case 'in-progress':
      return (
        <div
          className="flex h-4 w-4 items-center justify-center rounded-full motion-safe:animate-spin"
          style={{ backgroundColor: agentColor }}
        >
          <Loader2 className="h-2.5 w-2.5 text-white" />
        </div>
      );
    case 'failed':
      return (
        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-error">
          <X className="h-2.5 w-2.5 text-white" />
        </div>
      );
    case 'pending':
    default:
      return <div className="h-4 w-4 rounded-full border-2 border-foreground-muted/30" />;
  }
});
