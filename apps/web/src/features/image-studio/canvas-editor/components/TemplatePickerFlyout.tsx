/**
 * TemplatePickerFlyout - Flyout for selecting a template when adding a new page
 *
 * Displays a grid of template options with previews.
 * Includes option to duplicate current page.
 */

import React, { useCallback, useState, useRef, useEffect, memo } from 'react';
import { HiOutlineDuplicate, HiX, HiPlus } from 'react-icons/hi';

import { getAllTemplates, type TemplateInfo } from '../utils/templateRegistry';

import type { CanvasConfigId } from '../configs/types';

import './TemplatePickerFlyout.css';

interface TemplatePickerFlyoutProps {
  onSelectTemplate: (configId: CanvasConfigId) => void;
  onDuplicateCurrent: () => void;
  onClose: () => void;
  currentTemplateId?: CanvasConfigId;
  isOpen: boolean;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

interface TemplateCardProps {
  template: TemplateInfo;
  onSelect: (configId: CanvasConfigId) => void;
  isCurrent: boolean;
}

/**
 * Memoized template card - prevents re-renders when other cards change.
 * Uses onSelect(templateId) pattern instead of onClick closure for stable reference.
 */
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
      className={`template-card ${isCurrent ? 'template-card--current' : ''}`}
      onClick={handleClick}
      type="button"
    >
      <div className="template-card__preview">
        <img src={template.previewImage} alt={template.label} loading="lazy" />
      </div>
      <div className="template-card__info">
        <span className="template-card__label">{template.label}</span>
        {isCurrent && <span className="template-card__badge">Aktuell</span>}
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
}: TemplatePickerFlyoutProps) {
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const templates = getAllTemplates();

  // Calculate position relative to anchor
  useEffect(() => {
    if (isOpen && anchorRef?.current && flyoutRef.current) {
      const anchorRect = anchorRef.current.getBoundingClientRect();
      const flyoutRect = flyoutRef.current.getBoundingClientRect();

      // Position above the anchor button, centered
      let left = anchorRect.left + anchorRect.width / 2 - flyoutRect.width / 2;
      let top = anchorRect.top - flyoutRect.height - 12;

      // Ensure flyout stays within viewport
      const padding = 16;
      if (left < padding) left = padding;
      if (left + flyoutRect.width > window.innerWidth - padding) {
        left = window.innerWidth - flyoutRect.width - padding;
      }
      if (top < padding) {
        // Show below if not enough space above
        top = anchorRect.bottom + 12;
      }

      setPosition({ top, left });
    }
  }, [isOpen, anchorRef]);

  // Close on click outside
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

  if (!isOpen) return null;

  return (
    <div
      ref={flyoutRef}
      className="template-picker-flyout"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
      }}
    >
      <div className="template-picker-flyout__header">
        <h3>Seite hinzufügen</h3>
        <button
          className="template-picker-flyout__close"
          onClick={onClose}
          type="button"
          aria-label="Schließen"
        >
          <HiX />
        </button>
      </div>

      <div className="template-picker-flyout__grid">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onSelect={handleTemplateSelect}
            isCurrent={template.id === currentTemplateId}
          />
        ))}
      </div>

      <div className="template-picker-flyout__divider" />

      <button className="template-picker-flyout__duplicate" onClick={handleDuplicate} type="button">
        <HiOutlineDuplicate />
        <span>Aktuelle Seite duplizieren</span>
      </button>
    </div>
  );
}

/**
 * AddPageButton - Button that triggers the template picker flyout
 */
interface AddPageButtonProps {
  onSelectTemplate: (configId: CanvasConfigId) => void;
  onDuplicateCurrent: () => void;
  currentTemplateId?: CanvasConfigId;
  disabled?: boolean;
}

export function AddPageButton({
  onSelectTemplate,
  onDuplicateCurrent,
  currentTemplateId,
  disabled = false,
}: AddPageButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        className="btn-primary size-s"
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
      />
    </>
  );
}

export default TemplatePickerFlyout;
