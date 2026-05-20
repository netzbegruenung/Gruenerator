/**
 * TemplatePickerFlyout - Flyout for selecting a template when adding a new page
 */

import React, { useCallback, useState, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineDuplicate, HiX, HiPlus, HiTemplate, HiBookOpen, HiStop } from 'react-icons/hi';

import {
  getAllTemplates,
  type TemplateCategory,
  type TemplateInfo,
} from '../utils/templateRegistry';

import type { CanvasConfigId } from '../configs/types';

import { cn } from '../utils/cn';

interface TemplatePickerFlyoutProps {
  onSelectTemplate: (configId: CanvasConfigId) => void;
  onDuplicateCurrent: () => void;
  onClose: () => void;
  currentTemplateId?: CanvasConfigId;
  isOpen: boolean;
  anchorRef?: React.RefObject<HTMLElement | null>;
  onAddSliderVariant?: (variant: 'cover' | 'content' | 'last') => void;
  /** Restrict shown templates to one category (e.g. 'sharepic'). Undefined shows all. */
  templateFilter?: TemplateCategory;
}

interface TemplateCardProps {
  template: TemplateInfo;
  onSelect: (configId: CanvasConfigId) => void;
  isCurrent: boolean;
}

const templateCardBase =
  'flex flex-col items-center p-1.5 bg-background-alt border-2 border-transparent rounded-md cursor-pointer transition-[border-color,transform,box-shadow] duration-150 hover:border-primary-600 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(70,150,43,0.15)]';

const TemplateCard = memo(function TemplateCard({
  template,
  onSelect,
  isCurrent,
}: TemplateCardProps) {
  const handleClick = useCallback(() => {
    onSelect(template.id);
  }, [onSelect, template.id]);

  return (
    <button
      className={cn(templateCardBase, isCurrent && 'border-primary-600 bg-primary-50')}
      onClick={handleClick}
      type="button"
    >
      <div className="w-full aspect-square rounded overflow-hidden mb-1">
        <img
          src={template.previewImage}
          alt={template.label}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[10px] font-medium text-foreground text-center leading-tight line-clamp-1">
          {template.label}
        </span>
        {isCurrent && (
          <span className="text-[9px] font-medium text-primary-600 bg-primary-50 px-1.5 py-px rounded">
            Aktuell
          </span>
        )}
      </div>
    </button>
  );
});

export function TemplatePickerFlyout({
  onSelectTemplate,
  onDuplicateCurrent,
  onClose,
  currentTemplateId,
  isOpen,
  anchorRef,
  onAddSliderVariant,
  templateFilter,
}: TemplatePickerFlyoutProps) {
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight?: number }>({
    top: 0,
    left: 0,
  });
  // 'freeform' is reachable via "Aktuelle Seite duplizieren" — hide it as a
  // distinct picker option so users don't get a redundant entry.
  const allTemplates = getAllTemplates().filter((t) => t.id !== 'freeform');
  const templates = templateFilter
    ? allTemplates.filter((t) => t.category === templateFilter)
    : allTemplates;

  useEffect(() => {
    if (isOpen && anchorRef?.current && flyoutRef.current) {
      const anchorRect = anchorRef.current.getBoundingClientRect();
      const flyoutRect = flyoutRef.current.getBoundingClientRect();
      const padding = 16;
      const gap = 12;

      let left = anchorRect.left + anchorRect.width / 2 - flyoutRect.width / 2;
      if (left < padding) left = padding;
      if (left + flyoutRect.width > window.innerWidth - padding) {
        left = window.innerWidth - flyoutRect.width - padding;
      }

      const spaceAbove = anchorRect.top - gap - padding;
      const spaceBelow = window.innerHeight - anchorRect.bottom - gap - padding;

      // When the anchor sits in a bottom bar (chevron in the page navigator),
      // we'd rather let the flyout overlap the bar than pin it to top with a
      // wasted gap above the anchor. So if "above" fits naturally, use it;
      // else allow the flyout to extend from top-padding all the way down to
      // the anchor's bottom — overlapping whatever is below.
      let top: number;
      let maxHeight: number | undefined;

      if (spaceAbove >= flyoutRect.height) {
        top = anchorRect.top - flyoutRect.height - gap;
      } else if (spaceBelow >= flyoutRect.height) {
        top = anchorRect.bottom + gap;
      } else if (spaceAbove >= spaceBelow) {
        top = padding;
        // Extend down to anchor's bottom so the flyout uses every available
        // pixel above and around the anchor — the bottom bar is allowed to
        // be covered.
        maxHeight = anchorRect.bottom - padding;
      } else {
        top = anchorRect.bottom + gap;
        maxHeight = spaceBelow;
      }

      setPosition({ top, left, maxHeight });
    }
  }, [isOpen, anchorRef]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        flyoutRef.current &&
        !flyoutRef.current.contains(e.target as Node) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, anchorRef]);

  const handleTemplateSelect = useCallback(
    (configId: CanvasConfigId) => {
      onSelectTemplate(configId);
      onClose();
    },
    [onSelectTemplate, onClose]
  );

  const handleDuplicate = useCallback(() => {
    onDuplicateCurrent();
    onClose();
  }, [onDuplicateCurrent, onClose]);

  const handleAddCover = useCallback(() => {
    onAddSliderVariant?.('cover');
    onClose();
  }, [onAddSliderVariant, onClose]);

  const handleAddContent = useCallback(() => {
    onAddSliderVariant?.('content');
    onClose();
  }, [onAddSliderVariant, onClose]);

  const handleAddLast = useCallback(() => {
    onAddSliderVariant?.('last');
    onClose();
  }, [onAddSliderVariant, onClose]);

  if (!isOpen) return null;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={flyoutRef}
      className="bg-background-pure border border-border rounded-xl shadow-lg p-3 z-[1000] min-w-[360px] max-w-[440px] max-h-[calc(100vh-32px)] overflow-y-auto scrollbar-thin animate-[flyout-enter_0.15s_ease-out] max-[480px]:!fixed max-[480px]:!bottom-0 max-[480px]:!left-0 max-[480px]:!top-auto max-[480px]:!right-0 max-[480px]:min-w-full max-[480px]:max-w-full max-[480px]:rounded-t-2xl max-[480px]:rounded-b-none max-[480px]:max-h-[70vh]"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        ...(position.maxHeight != null && {
          maxHeight: position.maxHeight,
          overflowY: 'auto' as const,
        }),
      }}
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="m-0 text-base font-semibold text-foreground-heading">Seite hinzufügen</h3>
        <button
          className="flex items-center justify-center size-7 p-0 bg-transparent border-none rounded-md cursor-pointer text-foreground-muted transition-[background-color,color] duration-150 hover:bg-hover-alt hover:text-foreground"
          onClick={onClose}
          type="button"
          aria-label="Schließen"
        >
          <HiX />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1.5 mb-3 max-[480px]:grid-cols-3 max-[480px]:gap-2">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onSelect={handleTemplateSelect}
            isCurrent={template.id === currentTemplateId}
          />
        ))}

        {onAddSliderVariant && (
          <>
            <button className={templateCardBase} onClick={handleAddCover} type="button">
              <div className="w-full aspect-square rounded overflow-hidden mb-1.5 flex items-center justify-center bg-background-alt [&>svg]:size-7 [&>svg]:text-foreground-muted">
                <HiTemplate />
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[11px] font-medium text-foreground text-center leading-tight">
                  Slider Start
                </span>
              </div>
            </button>
            <button className={templateCardBase} onClick={handleAddContent} type="button">
              <div className="w-full aspect-square rounded overflow-hidden mb-1.5 flex items-center justify-center bg-background-alt [&>svg]:size-7 [&>svg]:text-foreground-muted">
                <HiBookOpen />
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[11px] font-medium text-foreground text-center leading-tight">
                  Slider Text
                </span>
              </div>
            </button>
            <button className={templateCardBase} onClick={handleAddLast} type="button">
              <div className="w-full aspect-square rounded overflow-hidden mb-1.5 flex items-center justify-center bg-background-alt [&>svg]:size-7 [&>svg]:text-foreground-muted">
                <HiStop />
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[11px] font-medium text-foreground text-center leading-tight">
                  Slider Ende
                </span>
              </div>
            </button>
          </>
        )}
      </div>

      <div className="h-px bg-border my-3" />

      <button
        className="flex items-center justify-center gap-2 w-full py-2.5 px-3 bg-background-alt border border-border rounded-lg cursor-pointer text-[13px] font-medium text-foreground transition-[background-color,border-color] duration-150 hover:bg-hover-alt hover:border-grey-400 dark:hover:border-grey-500 [&>svg]:size-[18px] [&>svg]:text-foreground-muted"
        onClick={handleDuplicate}
        type="button"
      >
        <HiOutlineDuplicate />
        <span>Aktuelle Seite duplizieren</span>
      </button>
    </div>,
    document.body
  );
}

interface AddPageButtonProps {
  onSelectTemplate: (configId: CanvasConfigId) => void;
  onDuplicateCurrent: () => void;
  currentTemplateId?: CanvasConfigId;
  disabled?: boolean;
  onAddSliderVariant?: (variant: 'cover' | 'content' | 'last') => void;
  templateFilter?: TemplateCategory;
}

export function AddPageButton({
  onSelectTemplate,
  onDuplicateCurrent,
  currentTemplateId,
  disabled = false,
  onAddSliderVariant,
  templateFilter,
}: AddPageButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        className="w-full h-11 rounded-lg border border-grey-300 dark:border-grey-600 bg-transparent text-foreground font-medium text-sm cursor-pointer flex items-center justify-center gap-2 transition-[background-color,border-color] duration-200 hover:bg-grey-100 dark:hover:bg-grey-800 hover:border-grey-400 dark:hover:border-grey-500 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        type="button"
        title="Neue Seite hinzufügen"
      >
        <HiPlus />
        <span>Seite hinzufügen</span>
      </button>

      <TemplatePickerFlyout
        isOpen={isOpen}
        anchorRef={buttonRef}
        onSelectTemplate={onSelectTemplate}
        onDuplicateCurrent={onDuplicateCurrent}
        onClose={() => setIsOpen(false)}
        currentTemplateId={currentTemplateId}
        onAddSliderVariant={onAddSliderVariant}
        templateFilter={templateFilter}
      />
    </>
  );
}

export default TemplatePickerFlyout;
