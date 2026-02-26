import { cn } from '@gruenerator/chat';
import { BookOpen } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useNotebookChatStore } from '../stores/notebookChatStore';
import useNotebookStore from '../stores/notebookStore';
import { resolveNotebookChatEntries } from '../utils/notebookChatResolver';

export function NotebookChatItems() {
  const navigate = useNavigate();
  const location = useLocation();
  const chats = useNotebookChatStore((state) => state.chats);
  const qaCollections = useNotebookStore((state) => state.qaCollections);
  const fetchQACollections = useNotebookStore((state) => state.fetchQACollections);

  useEffect(() => {
    if (qaCollections.length === 0) {
      fetchQACollections();
    }
  }, [qaCollections.length, fetchQACollections]);

  const userCollections = useMemo(
    () => qaCollections.map((c) => ({ id: c.id, name: c.name })),
    [qaCollections]
  );

  const entries = useMemo(
    () => resolveNotebookChatEntries(chats, userCollections),
    [chats, userCollections]
  );

  if (entries.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="mb-1 px-3 text-xs font-medium text-foreground-muted">Notebooks</div>
      {entries.map((entry) => {
        const isActive = location.pathname === entry.path;
        return (
          <button
            key={entry.collectionKey}
            onClick={(e) => {
              e.stopPropagation();
              navigate(entry.path);
            }}
            className={cn(
              'group flex w-full items-center gap-2 rounded-lg px-3 py-2 transition-colors',
              'hover:bg-primary/5',
              isActive && 'bg-primary/10 text-primary'
            )}
          >
            <BookOpen className="h-4 w-4 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-left text-sm">{entry.title}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
