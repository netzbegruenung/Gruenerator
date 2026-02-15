'use client';

import { useState, useMemo, useCallback } from 'react';
import { ThreadListPrimitive } from '@assistant-ui/react';
import { cn } from '../lib/utils';
import { Plus, Archive, ChevronDown } from 'lucide-react';
import {
  GrueneratorThreadListItem,
  GrueneratorArchivedThreadListItem,
} from './thread/ThreadListItem';

const threadComponents = { ThreadListItem: GrueneratorThreadListItem };
const archivedComponents = { ThreadListItem: GrueneratorArchivedThreadListItem };

export function ChatThreadList() {
  const [showArchived, setShowArchived] = useState(false);
  const toggleArchived = useCallback(() => setShowArchived((prev) => !prev), []);

  return (
    <ThreadListPrimitive.Root className="flex flex-1 flex-col overflow-hidden">
      <div className="px-4 pt-2 pb-2">
        <ThreadListPrimitive.New
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
            'text-foreground-muted hover:bg-primary/5 hover:text-primary'
          )}
        >
          <Plus className="h-4 w-4" />
          Neuer Chat
        </ThreadListPrimitive.New>
      </div>

      <div className="flex-1 overflow-y-auto px-4 scrollbar-thin">
        <ThreadListPrimitive.Items components={threadComponents} />

        <div className="mt-4">
          <button
            onClick={toggleArchived}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:text-foreground"
          >
            <Archive className="h-3.5 w-3.5" />
            Archiviert
            <ChevronDown
              className={cn(
                'ml-auto h-3.5 w-3.5 transition-transform',
                showArchived && 'rotate-180'
              )}
            />
          </button>

          {showArchived && (
            <ThreadListPrimitive.Items archived components={archivedComponents} />
          )}
        </div>
      </div>
    </ThreadListPrimitive.Root>
  );
}
