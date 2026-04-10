import { Replace, Search } from 'lucide-react';
import { useMemo, useState, type RefObject } from 'react';

import { useChunks, useHistoryDuration } from '../stores/historyStore';

import { ExportDropdown } from './ExportDropdown';
import { SubtitleFindReplace } from './SubtitleFindReplace';
import { SubtitleList } from './SubtitleList';

import type { BetaVideoPlayerRef } from './BetaVideoPlayer';

import { cn } from '@/utils/cn';

interface SubtitlePanelProps {
  videoPlayerRef: RefObject<BetaVideoPlayerRef | null>;
  projectId: string;
  projectTitle: string;
  isFindReplaceOpen?: boolean;
  onToggleFindReplace?: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SubtitlePanel({
  videoPlayerRef,
  projectId,
  projectTitle,
  isFindReplaceOpen = false,
  onToggleFindReplace,
}: SubtitlePanelProps) {
  const chunks = useChunks();
  const duration = useHistoryDuration();
  const [searchTerm, setSearchTerm] = useState('');

  const activeChunks = useMemo(() => chunks.filter((c) => !c.deleted), [chunks]);

  const totalDuration = useMemo(
    () => activeChunks.reduce((sum, c) => sum + (c.timestamp[1] - c.timestamp[0]), 0),
    [activeChunks]
  );

  return (
    <div className="flex min-h-0 flex-[2] flex-col border-l border-grey-200 bg-background dark:border-grey-700">
      {/* Top Bar: Search + Export */}
      <div className="flex items-center gap-sm border-b border-grey-200 px-sm py-xs dark:border-grey-700">
        <div className="relative flex-1">
          <Search className="absolute left-sm top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-grey-400" />
          <input
            type="text"
            placeholder="Suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-md border border-grey-200 bg-background py-xs pl-[30px] pr-sm text-sm text-foreground placeholder:text-grey-400 focus:border-primary-400 focus:outline-none dark:border-grey-700"
          />
        </div>
        {onToggleFindReplace && (
          <button
            onClick={onToggleFindReplace}
            className={cn(
              'rounded-md p-1.5 transition-colors',
              isFindReplaceOpen
                ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                : 'text-grey-400 hover:bg-grey-100 dark:hover:bg-grey-800'
            )}
            title="Suchen & Ersetzen (Ctrl+F)"
          >
            <Replace className="h-3.5 w-3.5" />
          </button>
        )}
        <ExportDropdown chunks={activeChunks} projectTitle={projectTitle} />
      </div>

      {/* Find/Replace panel */}
      <SubtitleFindReplace isOpen={isFindReplaceOpen} onClose={() => onToggleFindReplace?.()} />

      {/* Stats bar */}
      <div className="flex items-center gap-md border-b border-grey-200 px-md py-xs text-xs text-grey-500 dark:border-grey-700">
        <span>{activeChunks.length} Untertitel</span>
        <span>·</span>
        <span>{formatDuration(totalDuration)} Gesamtdauer</span>
      </div>

      {/* Subtitle List */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <SubtitleList videoPlayerRef={videoPlayerRef} />
      </div>
    </div>
  );
}
