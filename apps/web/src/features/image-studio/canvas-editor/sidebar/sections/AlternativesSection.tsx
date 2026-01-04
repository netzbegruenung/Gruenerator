import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FaExchangeAlt, FaChevronDown } from 'react-icons/fa';
import type { AlternativesSectionProps } from '../types';

export function AlternativesSection({
  alternatives,
  currentQuote,
  onAlternativeSelect,
}: AlternativesSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (alternatives.length === 0) {
    return (
      <div className="sidebar-section sidebar-section--alternatives">
        <p className="sidebar-section__empty">Keine Alternativen verfügbar</p>
      </div>
    );
  }

  const getPreview = (text: string) => {
    return text.length > 50 ? text.slice(0, 50) + '...' : text;
  };

  return (
    <div className="sidebar-section sidebar-section--alternatives">
      <button
        className={`sidebar-section-toggle ${isOpen ? 'sidebar-section-toggle--open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <FaExchangeAlt />
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
            <div className="alternatives-list">
              {alternatives.map((alt, index) => {
                const isActive = alt === currentQuote;
                return (
                  <button
                    key={index}
                    className={`alternative-item ${isActive ? 'alternative-item--active' : ''}`}
                    onClick={() => onAlternativeSelect(alt)}
                    type="button"
                    title={alt}
                  >
                    &ldquo;{getPreview(alt)}&rdquo;
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
