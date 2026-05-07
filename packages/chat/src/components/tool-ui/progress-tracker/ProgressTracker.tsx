'use client';

import { memo } from 'react';
import { X } from 'lucide-react';
import { ShimmerText } from '../../message-parts/ShimmerText';
import type { ProgressStep } from '../../../hooks/useChatGraphStream';

interface ProgressTrackerComponentProps {
  steps: ProgressStep[];
  agentColor?: string;
  totalTimeMs?: number;
}

export const ProgressTracker = memo(function ProgressTracker({
  steps,
}: ProgressTrackerComponentProps) {
  if (steps.length === 0) return null;

  const failed = steps.find((s) => s.status === 'failed');
  if (failed) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-error-bg px-3 py-1.5 text-xs text-error">
        <X className="h-3.5 w-3.5" />
        <span className="font-medium">{failed.label}</span>
      </div>
    );
  }

  const active = steps.find((s) => s.status === 'in-progress') ?? steps[steps.length - 1];
  if (!active || active.status === 'completed') return null;

  return (
    <div className="px-3 py-1.5 text-sm">
      <ShimmerText>{active.label}</ShimmerText>
    </div>
  );
});
