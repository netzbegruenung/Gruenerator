import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { FaChevronDown } from 'react-icons/fa';

import { SidebarHint } from '../components/SidebarHint';
import {
  SIDEBAR_SECTION,
  SIDEBAR_SECTION_EMPTY,
  ALTERNATIVES_LIST,
  ALTERNATIVE_ITEM,
  ALTERNATIVE_ITEM_ACTIVE,
  CARD_GRID,
  CARD_GRID_SINGLE_COL,
  SELECTABLE_CARD_WITH_TEXT,
  SELECTABLE_CARD_ACTIVE,
  SECTION_TOGGLE,
  SECTION_TOGGLE_OPEN,
} from '../primitives';

import { cn } from '@/utils/cn';

interface AlternativesRendererProps<T> {
  alternatives: T[];
  isActive: (alt: T, index: number) => boolean;
  getDisplayText: (alt: T, index: number) => string;
  onSelect: (alt: T, index: number) => void;
  layout: 'pills' | 'cards';
  collapsible: boolean;
  defaultOpen: boolean;
  emptyMessage?: string;
  hintText?: string;
  icon?: React.ComponentType;
  renderPreview?: (alt: T, index: number) => React.ReactNode;
}

export function AlternativesRenderer<T>({
  alternatives,
  isActive,
  getDisplayText,
  onSelect,
  layout,
  collapsible,
  defaultOpen,
  emptyMessage = 'Keine Alternativen verfügbar',
  hintText,
  icon: Icon,
  renderPreview,
}: AlternativesRendererProps<T>) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (alternatives.length === 0) {
    return (
      <div className={SIDEBAR_SECTION}>
        <p className={SIDEBAR_SECTION_EMPTY}>{emptyMessage}</p>
      </div>
    );
  }

  // Non-collapsible cards layout uses single-column grid with bordered cards (dreizeilen style)
  const isDreizeilenCards = layout === 'cards' && !collapsible;

  const renderContent = () => {
    if (layout === 'pills') {
      return (
        <div className={ALTERNATIVES_LIST}>
          {alternatives.map((alt, index) => {
            const active = isActive(alt, index);
            return (
              <button
                key={index}
                className={cn(ALTERNATIVE_ITEM, active && ALTERNATIVE_ITEM_ACTIVE)}
                onClick={() => onSelect(alt, index)}
                type="button"
                title={getDisplayText(alt, index)}
              >
                &ldquo;{getDisplayText(alt, index)}&rdquo;
              </button>
            );
          })}
        </div>
      );
    } else {
      return (
        <div className={isDreizeilenCards ? CARD_GRID_SINGLE_COL : CARD_GRID}>
          {alternatives.map((alt, index) => {
            const active = isActive(alt, index);
            const displayText = getDisplayText(alt, index);
            const isOriginal = index === 0;
            return (
              <button
                key={index}
                className={cn(
                  SELECTABLE_CARD_WITH_TEXT,
                  isDreizeilenCards && 'border-[var(--border-subtle)] bg-[var(--card-background)]',
                  active &&
                    (isDreizeilenCards ? 'bg-background-alt border-accent' : SELECTABLE_CARD_ACTIVE)
                )}
                onClick={() => onSelect(alt, index)}
                type="button"
              >
                <div className="flex-1 flex flex-col gap-[var(--spacing-xxsmall)] items-start">
                  {isOriginal && (
                    <span className="text-[length:var(--font-size-xxs)] font-semibold uppercase text-[var(--interactive-accent-color)] bg-background-alt py-0.5 px-1.5 rounded-[3px] tracking-[0.3px] max-canvas-mobile:text-[7px] max-canvas-mobile:py-px max-canvas-mobile:px-1">
                      Original
                    </span>
                  )}
                  <span className="flex-1 text-left text-[length:var(--font-size-small)] text-foreground leading-[1.4] max-canvas-mobile:text-[10px] max-canvas-mobile:leading-[1.3]">
                    {displayText}
                  </span>
                </div>
                {renderPreview && renderPreview(alt, index)}
              </button>
            );
          })}
        </div>
      );
    }
  };

  const content = renderContent();

  if (collapsible) {
    return (
      <div className={SIDEBAR_SECTION}>
        <button
          className={cn(SECTION_TOGGLE, isOpen && SECTION_TOGGLE_OPEN)}
          onClick={() => setIsOpen(!isOpen)}
          type="button"
        >
          {Icon && <Icon />}
          Alternativen ({alternatives.length})
          <FaChevronDown />
        </button>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: 'hidden' }}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>
        {hintText && <SidebarHint>{hintText}</SidebarHint>}
      </div>
    );
  }

  return (
    <div className={SIDEBAR_SECTION}>
      {content}
      {hintText && <SidebarHint>{hintText}</SidebarHint>}
    </div>
  );
}
