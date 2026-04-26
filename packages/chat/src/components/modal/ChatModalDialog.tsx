import { X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../lib/utils';

export interface ChatModalDialogProps {
  open: boolean;
  onClose: () => void;
  /** Title shown in the header. */
  title: string;
  /** Icon rendered before the title in the header. */
  headerIcon: ReactNode;
  /** Additional classes for the header bar. Defaults to `bg-primary text-white`. */
  headerClassName?: string;
  /** Optional footer content. Pass `null` to hide. */
  footer?: ReactNode | null;
  /** The chat content (typically a CompactThread, GrueneratorThread, or similar). */
  children: ReactNode;
  /** Additional classes for the dialog panel. */
  panelClassName?: string;
}

export function ChatModalDialog({
  open,
  onClose,
  title,
  headerIcon,
  headerClassName,
  footer,
  children,
  panelClassName,
}: ChatModalDialogProps) {
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
          'max-[480px]:h-full max-[480px]:w-full max-[480px]:rounded-none max-[480px]:border-none',
          panelClassName
        )}
      >
        <div
          className={cn(
            'flex items-center gap-2 border-b border-border px-4 py-3',
            headerClassName ?? 'bg-primary text-white'
          )}
        >
          <span className="flex size-4 shrink-0 items-center justify-center">{headerIcon}</span>
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

        {children}

        {footer !== null && footer !== undefined && (
          <div className="flex items-center justify-center border-t border-border px-4 py-1.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
