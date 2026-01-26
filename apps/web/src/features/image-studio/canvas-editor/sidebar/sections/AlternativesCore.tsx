import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { FaChevronDown } from 'react-icons/fa';

import { SidebarHint } from '../components/SidebarHint';

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
      <div className="sidebar-section sidebar-section--alternatives">
        <p className="sidebar-section__empty">{emptyMessage}</p>
      </div>
    );
  }

  const renderContent = () => {
    if (layout === 'pills') {
      return (
        <div className="alternatives-list">
          {alternatives.map((alt, index) => {
            const active = isActive(alt, index);
            return (
              <button
                key={index}
                className={`alternative-item ${active ? 'alternative-item--active' : ''}`}
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
        <div className="sidebar-card-grid">
          {alternatives.map((alt, index) => {
            const active = isActive(alt, index);
            const displayText = getDisplayText(alt, index);
            const isOriginal = index === 0;
            return (
              <button
                key={index}
                className={`sidebar-selectable-card sidebar-selectable-card--with-text ${
                  active ? 'sidebar-selectable-card--active' : ''
                }`}
                onClick={() => onSelect(alt, index)}
                type="button"
              >
                <div className="sidebar-selectable-card__content">
                  {isOriginal && <span className="sidebar-selectable-card__badge">Original</span>}
                  <span className="sidebar-selectable-card__text">{displayText}</span>
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
      <div className="sidebar-section sidebar-section--alternatives">
        <button
          className={`sidebar-section-toggle ${isOpen ? 'sidebar-section-toggle--open' : ''}`}
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
    <div className="sidebar-section sidebar-section--dreizeilen-alternatives">
      {content}
      {hintText && <SidebarHint>{hintText}</SidebarHint>}
    </div>
  );
}
