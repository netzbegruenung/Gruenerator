import { AssistantModalPrimitive } from '@assistant-ui/react';
import { Leaf, X } from 'lucide-react';

import { cn } from '../../lib/utils';
import { NotebookChatProvider } from '../../runtime/NotebookChatProvider';
import { ModalThread } from './ModalThread';

export interface GruenOMatModalProps {
  collectionId?: string;
  collectionName?: string;
  title?: string;
  position?: 'bottom-right' | 'bottom-left';
  endpoint?: string;
  suggestions?: string[];
}

function ModalContent({ title, suggestions }: Pick<GruenOMatModalProps, 'title' | 'suggestions'>) {
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border bg-primary px-4 py-3 text-white">
        <Leaf className="size-4" />
        <span className="flex-1 text-sm font-semibold">{title || 'Grün-O-Mat'}</span>
        <AssistantModalPrimitive.Trigger asChild>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded opacity-80 transition-opacity hover:opacity-100"
            aria-label="Schließen"
          >
            <X className="size-4" />
          </button>
        </AssistantModalPrimitive.Trigger>
      </div>

      <ModalThread suggestions={suggestions} className="flex-1" />

      <div className="flex items-center justify-center border-t border-border px-4 py-1.5">
        <a
          href="https://gruen-o-mat.eu"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-foreground-muted transition-colors hover:text-foreground"
        >
          Powered by Grünerator
        </a>
      </div>
    </>
  );
}

export function GruenOMatModal({
  collectionId = 'gruene-de-system',
  collectionName = 'gruene.de',
  title = 'Grün-O-Mat',
  position = 'bottom-right',
  endpoint = '/api/gruen-o-mat/stream',
  suggestions,
}: GruenOMatModalProps) {
  const isRight = position === 'bottom-right';

  const collection = {
    id: collectionId,
    name: collectionName,
    linkType: 'url' as const,
  };

  return (
    <NotebookChatProvider collections={[collection]} mode="fast" endpoint={endpoint}>
      <AssistantModalPrimitive.Root>
        <AssistantModalPrimitive.Anchor
          className={cn('fixed bottom-4 z-[2147483646]', isRight ? 'right-4' : 'left-4')}
        >
          <AssistantModalPrimitive.Trigger asChild>
            <button
              type="button"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform hover:scale-105"
              aria-label={title + ' öffnen'}
            >
              <Leaf className="size-6" />
            </button>
          </AssistantModalPrimitive.Trigger>
        </AssistantModalPrimitive.Anchor>

        <AssistantModalPrimitive.Content
          sideOffset={16}
          className={cn(
            'z-[2147483647] flex h-[min(600px,calc(100dvh-108px))] w-[400px] flex-col overflow-hidden rounded-2xl border border-grey-200 bg-background shadow-xl dark:border-grey-700',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-bottom-2',
            'max-[480px]:fixed max-[480px]:inset-0 max-[480px]:h-full max-[480px]:w-full max-[480px]:rounded-none max-[480px]:border-none'
          )}
        >
          <ModalContent title={title} suggestions={suggestions} />
        </AssistantModalPrimitive.Content>
      </AssistantModalPrimitive.Root>
    </NotebookChatProvider>
  );
}
