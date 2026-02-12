'use client';

import { Loader2, Search, FileText, Image } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ChatProgress } from '../../hooks/useChatGraphStream';

interface ProgressIndicatorProps {
  progress: ChatProgress;
  agentColor: string;
}

export function ProgressIndicator({ progress, agentColor }: ProgressIndicatorProps) {
  if (progress.stage === 'idle' || progress.stage === 'complete' || progress.intent === 'direct') {
    return null;
  }

  const getIcon = () => {
    switch (progress.stage) {
      case 'classifying':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'searching':
        return <Search className="h-4 w-4" />;
      case 'generating_image':
        return <Image className="h-4 w-4" />;
      case 'generating':
        return <FileText className="h-4 w-4" />;
      case 'error':
        return null;
      default:
        return <Loader2 className="h-4 w-4 animate-spin" />;
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
      <span>{progress.message}</span>
    </div>
  );
}
