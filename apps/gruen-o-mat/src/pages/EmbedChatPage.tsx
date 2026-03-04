import { NotebookChatProvider } from '@gruenerator/chat';
import { useParams } from 'react-router-dom';

import { ChatThread } from '../components/ChatThread';
import { getNotebookByCollectionId } from '../config/notebooks';

export function EmbedChatPage() {
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
      <main className="flex-1 overflow-hidden">
        <NotebookChatProvider
          collections={[collection]}
          mode="fast"
          endpoint="/api/gruen-o-mat/stream"
        >
          <ChatThread />
        </NotebookChatProvider>
      </main>

      <footer className="flex items-center justify-center border-t border-border px-4 py-2">
        <a
          href="https://gruen-o-mat.eu"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-foreground-muted transition-colors hover:text-foreground"
        >
          Powered by Grünerator
        </a>
      </footer>
    </div>
  );
}
