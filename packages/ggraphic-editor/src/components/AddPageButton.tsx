// SPDX-License-Identifier: MPL-2.0
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { cn } from '@ggraphic/editor/utils/cn';
import { useRef, useState } from 'react';
import { HiPlus } from 'react-icons/hi';

import type { PagePickerSlot } from './PageThumbnailStrip.js';

interface AddPageButtonProps {
  /** Without a host picker: adds a page like the active one. */
  onAddPage: () => void;
  /** Null without a host picker; the button then adds right away. */
  renderPicker: PagePickerSlot | null;
  disabled?: boolean;
  /** Flache Bauform für die untere Leiste; sonst der breite Knopf unter der Fläche. */
  compact?: boolean;
}

/** „Seite hinzufügen": opens the host's page picker, or adds a page without one. */
export function AddPageButton({
  onAddPage,
  renderPicker,
  disabled = false,
  compact = false,
}: AddPageButtonProps) {
  const t = useMessages();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        className={cn(
          'rounded-[10px] border border-[var(--editor-border-strong)] bg-[var(--editor-surface)] text-[var(--editor-text)] font-semibold cursor-pointer flex items-center justify-center gap-2 transition-[background-color,border-color] duration-200 hover:bg-[var(--editor-surface-hover)] hover:border-[var(--editor-accent)] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed',
          compact ? 'h-8 px-3 text-xs' : 'w-full h-11 text-sm'
        )}
        onClick={renderPicker ? () => setIsOpen(!isOpen) : onAddPage}
        disabled={disabled}
        type="button"
        title={t.shell.addNewPage}
      >
        <HiPlus />
        <span>{t.shell.addPage}</span>
      </button>

      {renderPicker?.({ isOpen, anchorRef: buttonRef, onClose: () => setIsOpen(false) })}
    </>
  );
}
