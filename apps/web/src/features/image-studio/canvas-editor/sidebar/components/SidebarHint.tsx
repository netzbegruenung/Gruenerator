import { useState, useRef, useEffect } from 'react';
import { FaQuestionCircle, FaTimes } from 'react-icons/fa';
import './SidebarHint.css';

interface SidebarHintProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function SidebarHint({ children, className = '', style }: SidebarHintProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  return (
    <>
      {/* Desktop: inline hint */}
      <p className={`sidebar-hint sidebar-hint--desktop ${className}`} style={style}>
        {children}
      </p>

      {/* Mobile: question mark button + popup */}
      <div className="sidebar-hint-mobile">
        <button
          ref={buttonRef}
          type="button"
          className="sidebar-hint-trigger"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Hinweis anzeigen"
          aria-expanded={isOpen}
        >
          <FaQuestionCircle size={16} />
        </button>

        {isOpen && (
          <div ref={popupRef} className="sidebar-hint-popup" role="tooltip">
            <button
              type="button"
              className="sidebar-hint-popup__close"
              onClick={() => setIsOpen(false)}
              aria-label="Schließen"
            >
              <FaTimes size={12} />
            </button>
            <div className="sidebar-hint-popup__content">{children}</div>
          </div>
        )}
      </div>
    </>
  );
}
