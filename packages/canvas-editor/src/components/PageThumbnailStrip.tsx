import { memo, useCallback, useRef, useState } from 'react';
import { PiCaretDown, PiPlus } from 'react-icons/pi';

import { TemplatePickerFlyout } from './TemplatePickerFlyout';

import type { CanvasConfigId, FullCanvasConfig, HeterogeneousPage } from '../configs/types';
import type { TemplateCategory } from '../utils/templateRegistry';

import { cn } from '../utils/cn';

interface PageThumbnailStripProps {
  pages: HeterogeneousPage[];
  currentPageIndex: number;
  thumbnails: Map<string, string>;
  loadedConfigs: Map<CanvasConfigId, FullCanvasConfig>;
  currentTemplateId: CanvasConfigId | undefined;
  canAddMore: boolean;
  onSelect: (index: number) => void;
  onAddPage: (configId: CanvasConfigId) => void;
  onDuplicateCurrent: () => void;
  onAddSliderVariant?: (variant: 'cover' | 'content' | 'last') => void;
  templateFilter?: TemplateCategory;
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
  onDuplicateCurrent,
  onAddSliderVariant,
  templateFilter,
}: PageThumbnailStripProps) {
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);
  const chevronRef = useRef<HTMLButtonElement>(null);

  const handleQuickAdd = useCallback(() => {
    if (currentTemplateId) onAddPage(currentTemplateId);
  }, [currentTemplateId, onAddPage]);

  const handleToggleFlyout = useCallback(() => {
    setIsFlyoutOpen((v) => !v);
  }, []);

  const handleCloseFlyout = useCallback(() => {
    setIsFlyoutOpen(false);
  }, []);

  return (
    <div className="page-thumbnail-strip flex items-center gap-2 px-3 py-2 overflow-x-auto scrollbar-thin">
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
            style={{ height: 64, aspectRatio }}
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

            <span className="absolute left-1 bottom-1 px-1 py-px rounded bg-black/70 text-white text-[10px] font-semibold leading-none pointer-events-none">
              {index + 1}
            </span>
          </div>
        );
      })}

      {canAddMore && (
        <div className="flex items-center shrink-0 ml-1 rounded-md bg-[var(--editor-inset)] border border-[var(--editor-border)] overflow-hidden">
          <button
            className="h-12 px-3 flex items-center justify-center text-[var(--editor-text-secondary)] hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleQuickAdd}
            disabled={!currentTemplateId}
            title="Seite hinzufügen"
            type="button"
          >
            <PiPlus size={18} />
          </button>
          <div className="w-px h-6 bg-[var(--editor-border)]" />
          <button
            ref={chevronRef}
            className="h-12 px-2 flex items-center justify-center text-[var(--editor-text-secondary)] hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)] transition-colors"
            onClick={handleToggleFlyout}
            title="Vorlage auswählen"
            type="button"
            aria-haspopup="menu"
            aria-expanded={isFlyoutOpen}
          >
            <PiCaretDown size={14} />
          </button>
          <TemplatePickerFlyout
            isOpen={isFlyoutOpen}
            anchorRef={chevronRef}
            onSelectTemplate={onAddPage}
            onDuplicateCurrent={onDuplicateCurrent}
            onClose={handleCloseFlyout}
            currentTemplateId={currentTemplateId}
            onAddSliderVariant={onAddSliderVariant}
            templateFilter={templateFilter}
          />
        </div>
      )}
    </div>
  );
});
