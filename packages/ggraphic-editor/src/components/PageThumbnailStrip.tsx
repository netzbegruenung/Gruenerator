// SPDX-License-Identifier: MPL-2.0
import { cn } from '@ggraphic/editor/utils/cn';
import { memo, useCallback, useRef, useState } from 'react';
import { PiCaretDown, PiPlus } from 'react-icons/pi';

import type { FullCanvasConfig, HeterogeneousPage } from '@ggraphic/editor/configs/types';
import type React from 'react';

/** Renders the host's page picker, anchored to a button; see `EditorShellExtensions.pagePicker`. */
export type PagePickerSlot = (open: {
  isOpen: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}) => React.ReactNode;

interface PageThumbnailStripProps {
  pages: HeterogeneousPage[];
  currentPageIndex: number;
  thumbnails: Map<string, string>;
  loadedConfigs: Map<string, FullCanvasConfig>;
  currentTemplateId: string | undefined;
  canAddMore: boolean;
  onSelect: (index: number) => void;
  /** „+": a page of this template, the active page's. */
  onAddPage: (configId: string) => void;
  /** „+" opens the picker instead (a slider page is a Start, Text or Ende slide). */
  quickAddOpensPicker: boolean;
  /** Null without a host picker: no „Vorlage auswählen" then. */
  renderPicker: PagePickerSlot | null;
}

export const PageThumbnailStrip = memo(function PageThumbnailStrip({
  pages,
  currentPageIndex,
  thumbnails,
  loadedConfigs,
  currentTemplateId,
  canAddMore,
  onSelect,
  onAddPage,
  quickAddOpensPicker,
  renderPicker,
}: PageThumbnailStripProps) {
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);
  const chevronRef = useRef<HTMLButtonElement>(null);

  // Slider decks have no sensible single "quick add" — a page is explicitly a
  // Start (green pill), Text or Ende slide — so "+" opens the variant picker
  // instead of silently appending a content slide.
  const handleQuickAdd = useCallback(() => {
    if (quickAddOpensPicker) {
      setIsFlyoutOpen(true);
      return;
    }
    if (currentTemplateId) onAddPage(currentTemplateId);
  }, [quickAddOpensPicker, currentTemplateId, onAddPage]);

  const handleToggleFlyout = useCallback(() => {
    setIsFlyoutOpen((v) => !v);
  }, []);

  const handleCloseFlyout = useCallback(() => {
    setIsFlyoutOpen(false);
  }, []);

  return (
    <div className="page-thumbnail-strip flex items-center gap-1.5 px-1.5 py-1 overflow-x-auto scrollbar-thin">
      {pages.map((page, index) => {
        const config = loadedConfigs.get(page.configId);
        const aspectRatio = config ? config.canvas.width / config.canvas.height : 1;
        const isActive = index === currentPageIndex;
        const dataUrl = thumbnails.get(page.id);

        return (
          <div
            key={page.id}
            className={cn(
              'page-thumbnail relative shrink-0 rounded-md overflow-hidden cursor-pointer transition-shadow border-2',
              isActive
                ? 'border-[var(--editor-accent)] shadow-[0_0_0_1px_var(--editor-accent)]'
                : 'border-[var(--editor-border)] hover:border-[var(--editor-border-strong)]'
            )}
            style={{ height: 44, aspectRatio }}
            onClick={() => onSelect(index)}
            role="button"
            tabIndex={0}
            aria-label={`Seite ${index + 1}${isActive ? ' (ausgewählt)' : ''}`}
            aria-pressed={isActive}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(index);
              }
            }}
          >
            {dataUrl ? (
              <img
                src={dataUrl}
                alt=""
                className="w-full h-full object-cover pointer-events-none"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full bg-[var(--editor-tile)]" />
            )}

            <span className="absolute left-0.5 bottom-0.5 px-1 py-px rounded bg-black/70 text-white text-[9px] font-semibold leading-none pointer-events-none">
              {index + 1}
            </span>
          </div>
        );
      })}

      {canAddMore && (
        <div className="flex items-center shrink-0 ml-0.5 rounded-md bg-[var(--editor-inset)] border border-[var(--editor-border)] overflow-hidden">
          <button
            className="h-8 max-canvas-mobile:h-11 max-canvas-mobile:min-w-11 px-2.5 flex items-center justify-center text-[var(--editor-text-secondary)] hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleQuickAdd}
            disabled={!currentTemplateId}
            title="Seite hinzufügen"
            aria-label="Seite hinzufügen"
            type="button"
          >
            <PiPlus size={16} />
          </button>
          {renderPicker && (
            <>
              <div className="w-px h-4 bg-[var(--editor-border)]" />
              <button
                ref={chevronRef}
                className="h-8 max-canvas-mobile:h-11 max-canvas-mobile:min-w-11 px-1.5 flex items-center justify-center text-[var(--editor-text-secondary)] hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)] transition-colors"
                onClick={handleToggleFlyout}
                title="Vorlage auswählen"
                aria-label="Vorlage auswählen"
                type="button"
                aria-expanded={isFlyoutOpen}
              >
                <PiCaretDown size={14} />
              </button>
              {renderPicker({
                isOpen: isFlyoutOpen,
                anchorRef: chevronRef,
                onClose: handleCloseFlyout,
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
});
