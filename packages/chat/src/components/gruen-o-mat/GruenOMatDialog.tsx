import { Leaf, X } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../lib/utils';
import { NotebookChatProvider } from '../../runtime/NotebookChatProvider';
import { ModalThread } from './ModalThread';

export interface GruenOMatDialogProps {
  open: boolean;
  onClose: () => void;
  collectionId?: string;
  collectionName?: string;
  title?: string;
  endpoint?: string;
  suggestions?: string[];
}

function DialogInner({
  open,
  onClose,
  title = 'Grün-O-Mat',
  suggestions,
}: Pick<GruenOMatDialogProps, 'open' | 'onClose' | 'title' | 'suggestions'>) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2147483646] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-label={title}
        aria-modal="true"
        className={cn(
          'relative z-10 flex h-[min(680px,calc(100dvh-64px))] w-[min(480px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-grey-200 bg-background shadow-2xl dark:border-grey-700',
          'animate-in fade-in-0 zoom-in-95',
          'max-[480px]:h-full max-[480px]:w-full max-[480px]:rounded-none max-[480px]:border-none'
        )}
      >
        <div className="flex items-center gap-2 border-b border-border bg-primary px-4 py-3 text-white">
          <Leaf className="size-4" />
          <span className="flex-1 text-sm font-semibold">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded opacity-80 transition-opacity hover:opacity-100"
            aria-label="Schließen"
          >
            <X className="size-4" />
          </button>
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
      </div>
    </div>,
    document.body
  );
}

export function GruenOMatDialog({
  open,
  onClose,
  collectionId = 'gruene-de-system',
  collectionName = 'gruene.de',
  title = 'Grün-O-Mat',
  endpoint = '/api/gruen-o-mat/stream',
  suggestions,
}: GruenOMatDialogProps) {
  const collection = {
    id: collectionId,
    name: collectionName,
    linkType: 'url' as const,
  };

  return (
    <NotebookChatProvider collections={[collection]} mode="fast" endpoint={endpoint}>
      <DialogInner open={open} onClose={onClose} title={title} suggestions={suggestions} />
    </NotebookChatProvider>
  );
}
