import { useEffect, useRef, type ReactNode } from 'react';
import { FiX } from 'react-icons/fi';

export interface MobileSheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** `full` is for the slide grid, which wants the whole screen. */
  size?: 'auto' | 'full';
}

/**
 * Bottom sheet used for every mobile-only surface in the deck editor (design
 * panel, text focus editor, slide grid). Hand-rolled rather than pulled from
 * `@gruenerator/ui` so this package keeps its minimal dependency set.
 *
 * Height is `dvh`-based so the iOS URL bar collapsing cannot clip the content,
 * and the body is padded by `--mobile-keyboard-offset` — the same variable the
 * chat panel uses — so the on-screen keyboard never covers an input.
 */
export function MobileSheet({ title, onClose, children, size = 'auto' }: MobileSheetProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Keep the page behind the sheet from scrolling under the user's finger.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-[240] bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`fixed inset-x-0 bottom-0 z-[241] flex flex-col rounded-t-2xl border-t border-[#E2E8E4] bg-white outline-none dark:border-grey-700 dark:bg-grey-900 ${
          size === 'full' ? 'top-0 rounded-none' : 'max-h-[85dvh]'
        }`}
      >
        <div className="flex flex-none items-center gap-2 px-4 pb-2 pt-2.5">
          <div
            className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-grey-300 dark:bg-grey-600"
            aria-hidden="true"
          />
          <div className="flex-1 pt-1.5 font-[Raleway] text-[15px] font-bold text-[#1B2A22] dark:text-grey-100">
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-[#6E7E74] hover:bg-[#EFF3F0] dark:hover:bg-grey-800"
          >
            <FiX size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom)+var(--mobile-keyboard-offset,0px))]">
          {children}
        </div>
      </div>
    </>
  );
}
