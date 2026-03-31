'use client';

import { useState, useCallback } from 'react';
import { ThreadListPrimitive } from '@assistant-ui/react';
import { cn } from '../lib/utils';
import { Archive, ChevronDown } from 'lucide-react';
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
      <div className="flex-1 overflow-y-auto px-4 pt-2 scrollbar-thin">
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

          {showArchived && <ThreadListPrimitive.Items archived components={archivedComponents} />}
        </div>
      </div>
    </ThreadListPrimitive.Root>
  );
}
