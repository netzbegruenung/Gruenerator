import { memo, useCallback, useState } from 'react';
import { PiFolder, PiFolderPlus, PiCaretRight } from 'react-icons/pi';

import { useFolders, useCreateFolder } from './api';

import { cn } from '@/utils/cn';

const EXPANDED_KEY = 'sidebar-folders-expanded';

/**
 * "Ordner" section at the top of the chat sidebar. Lists the user's chat-thread
 * folders as links to their folder home (/ordner/:id). Threads are sorted into
 * folders via the "Verschieben nach…" action on each chat row.
 */
export const FoldersSidebarSection = memo(function FoldersSidebarSection({
  sidebarExpanded,
  onLinkClick,
  isActive,
}: {
  sidebarExpanded: boolean;
  onLinkClick: (path: string, title: string) => void;
  isActive: (path: string) => boolean;
}) {
  const { data: folders = [] } = useFolders();
  const createFolder = useCreateFolder();

  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(EXPANDED_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(EXPANDED_KEY, next ? '1' : '0');
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  }, []);

  const submitNew = useCallback(async () => {
    const name = newName.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    await createFolder.mutateAsync(name).catch(() => {});
    setNewName('');
    setCreating(false);
  }, [newName, createFolder]);

  // Folders only render in the expanded sidebar (no icon-rail entries).
  if (!sidebarExpanded) return null;
  if (folders.length === 0 && !creating) {
    // Keep a lightweight "+ Ordner" affordance even when empty.
    return (
      <div className="px-2 pt-2">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex w-full items-center gap-1.5 px-3 py-1 text-xs font-medium text-grey-500 transition-colors hover:text-foreground"
        >
          <PiFolderPlus size={14} />
          <span>Neuer Ordner</span>
        </button>
      </div>
    );
  }

  return (
    <div className="px-2 pt-2">
      <div className="flex items-center">
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
          className="flex flex-1 items-center gap-1.5 px-3 py-1 text-xs font-medium text-grey-500 transition-colors hover:text-foreground"
        >
          <span>Ordner</span>
          <PiCaretRight
            className={cn('h-3 w-3 shrink-0 transition-transform', isExpanded && 'rotate-90')}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="shrink-0 p-1 text-grey-500 transition-colors hover:text-foreground"
          aria-label="Neuen Ordner erstellen"
          title="Neuer Ordner"
        >
          <PiFolderPlus size={14} />
        </button>
      </div>

      {isExpanded && (
        <div className="mt-0.5">
          {folders.map((folder) => {
            const path = `/ordner/${folder.id}`;
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => onLinkClick(path, folder.name)}
                className={cn(
                  'group flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-secondary-50 dark:hover:bg-secondary-800/40',
                  isActive(path) && 'bg-secondary-100 font-medium dark:bg-secondary-800/60'
                )}
              >
                <PiFolder size={16} className="shrink-0 text-grey-500" />
                <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              </button>
            );
          })}

          {creating && (
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => void submitNew()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitNew();
                if (e.key === 'Escape') {
                  setNewName('');
                  setCreating(false);
                }
              }}
              placeholder="Ordnername…"
              className="mx-1 mt-1 w-[calc(100%-0.5rem)] rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary-400"
            />
          )}
        </div>
      )}
    </div>
  );
});
