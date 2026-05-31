'use client';

import { Search, Image } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ShimmerText } from './ShimmerText';
import { type ProgressDisplay } from './progressDisplayContext';
import type { ChatProgress } from '../../hooks/useChatGraphStream';

interface ProgressIndicatorProps {
  progress: ChatProgress;
  agentColor: string;
  /** `box` (default): tinted pill + agent dot. `plain`: shimmering text only. */
  variant?: ProgressDisplay;
}

export function ProgressIndicator({
  progress,
  agentColor,
  variant = 'box',
}: ProgressIndicatorProps) {
  if (
    progress.stage === 'idle' ||
    progress.stage === 'complete' ||
    progress.stage === 'classifying' ||
    progress.intent === 'direct'
  ) {
    return null;
  }

  if (variant === 'plain') {
    return progress.stage === 'error' ? (
      <span className="text-sm text-error">{progress.message}</span>
    ) : (
      <ShimmerText className="text-sm">{progress.message}</ShimmerText>
    );
  }

  const getIcon = () => {
    switch (progress.stage) {
      case 'searching':
        return <Search className="h-4 w-4" />;
      case 'generating_image':
        return <Image className="h-4 w-4" />;
      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
        progress.stage === 'error' ? 'bg-error-bg text-error' : 'bg-primary/5 text-foreground-muted'
      )}
    >
      {progress.stage !== 'error' && (
        <div
          className="flex h-5 w-5 items-center justify-center rounded-full"
          style={{ backgroundColor: agentColor }}
        >
          {getIcon()}
        </div>
      )}
      {progress.stage === 'error' ? (
        <span>{progress.message}</span>
      ) : (
        <ShimmerText>{progress.message}</ShimmerText>
      )}
    </div>
  );
}
