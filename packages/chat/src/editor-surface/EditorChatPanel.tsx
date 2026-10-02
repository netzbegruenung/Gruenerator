import { X } from 'lucide-react';
import { type ReactNode } from 'react';

const FRAME =
  'w-80 min-w-80 max-w-80 flex flex-col border-l border-grey-200 dark:border-grey-700 bg-background dark:bg-grey-900 overflow-hidden max-md:w-full max-md:min-w-full max-md:max-w-full max-md:border-l-0';

const PLACEMENT_CLASS = {
  // Beside the editor on desktop; fullscreen above it on mobile, lifted by the
  // on-screen keyboard.
  inline: `${FRAME} max-md:fixed max-md:inset-0 max-md:z-[200] max-md:pb-[var(--mobile-keyboard-offset,0px)]`,
  // Floats over a full-bleed canvas at every width.
  overlay: `${FRAME} fixed top-0 right-0 bottom-0 z-[200] shadow-xl`,
} as const;

interface EditorChatPanelProps {
  /** Closed panels stay mounted (hidden via CSS) so the thread survives a reopen. */
  open: boolean;
  onClose: () => void;
  closeLabel: string;
  /** `inline`: close button only on mobile. `overlay`: header bar with an always-visible close. */
  placement: keyof typeof PLACEMENT_CLASS;
  tourId?: string;
  children: ReactNode;
}

/** Right-hand chat sidebar frame shared by the editors (docs, sheets, presentations, boards). */
export function EditorChatPanel({
  open,
  onClose,
  closeLabel,
  placement,
  tourId,
  children,
}: EditorChatPanelProps) {
  return (
    <aside data-tour={tourId} className={open ? PLACEMENT_CLASS[placement] : 'hidden'}>
      {placement === 'overlay' ? (
        <>
          <div className="flex items-center justify-end p-2 border-b border-grey-200 dark:border-grey-700 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-grey-600 hover:bg-grey-100 hover:text-foreground dark:text-grey-300 dark:hover:bg-grey-700"
              aria-label={closeLabel}
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 min-h-0">{children}</div>
        </>
      ) : (
        <>
          {children}
          <button
            type="button"
            onClick={onClose}
            className="hidden max-md:flex absolute top-2 right-2 z-10 h-9 w-9 items-center justify-center rounded-lg bg-background/90 dark:bg-grey-900/90 text-grey-600 hover:bg-grey-100 hover:text-foreground dark:text-grey-300 dark:hover:bg-grey-700 shadow-sm border border-grey-200 dark:border-grey-700"
            aria-label={closeLabel}
          >
            <X size={18} />
          </button>
        </>
      )}
    </aside>
  );
}
