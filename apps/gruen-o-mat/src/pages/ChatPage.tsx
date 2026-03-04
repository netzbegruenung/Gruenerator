import { NotebookChatProvider } from '@gruenerator/chat';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { ChatThread } from '../components/ChatThread';
import { RateLimitBadge } from '../components/RateLimitBadge';
import { getNotebookByCollectionId } from '../config/notebooks';

export function ChatPage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const resolvedId = collectionId || 'gruene-de-system';
  const notebook = getNotebookByCollectionId(resolvedId);

  const linkType = notebook?.linkType || 'url';
  const collection = {
    id: resolvedId,
    name: notebook?.name || 'gruene.de',
    linkType,
  };

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link
          to="/"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-muted
                     transition-colors hover:bg-surface-hover hover:text-foreground"
          aria-label="Zurück zur Übersicht"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white text-sm font-bold">
          {notebook?.emoji || 'G'}
        </div>
        <div className="flex flex-col">
          <h1 className="text-base font-semibold leading-tight">
            {notebook?.name || 'Grün-O-Mat'}
          </h1>
          {notebook?.badgeLabel && (
            <span className="text-xs text-foreground-muted">{notebook.badgeLabel}</span>
          )}
        </div>
        <div className="ml-auto">
          <RateLimitBadge />
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <NotebookChatProvider
          collections={[collection]}
          mode="fast"
          endpoint="/api/gruen-o-mat/stream"
        >
          <ChatThread />
        </NotebookChatProvider>
      </main>
    </div>
  );
}
