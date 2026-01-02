import { JSX, useEffect, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import useClickOutside from '../../../hooks/useClickOutside';
import './FilterPopover.css';

interface FilterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  anchorRef?: Record<string, unknown>;
  title?: string;
  className?: string;
}

const FilterPopover = ({ isOpen,
  onClose,
  children,
  anchorRef,
  title = "Filter",
  className = "" }: FilterPopoverProps): JSX.Element => {
  const popoverRef = useClickOutside(onClose, isOpen);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Calculate position based on anchor element
  useEffect(() => {
    if (isOpen && anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const popoverWidth = 280; // From CSS min-width

      // Position below the button with some gap
      const top = rect.bottom + 8;

      // Align to the right edge of the button, but ensure it stays in viewport
      let left = rect.right - popoverWidth;

      // Ensure popup doesn't go off the left edge of the screen
      if (left < 20) {
        left = 20;
      }

      // Ensure popup doesn't go off the right edge of the screen
      const maxLeft = window.innerWidth - popoverWidth - 20;
      if (left > maxLeft) {
        left = maxLeft;
      }

      setPosition({ top, left });
    }
  }, [isOpen, anchorRef]);

  // Handle escape key and focus management
  useEffect(() => {
    if (isOpen) {
      // Focus the popover when it opens
      if (popoverRef.current) {
        popoverRef.current.focus();
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const popoverContent = (
    <div
      ref={popoverRef}
      className={`filter-popover ${className}`}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`
      }}
      role="dialog"
      aria-labelledby="filter-popover-title"
      aria-modal="true"
      tabIndex={-1}
    >
      <div className="filter-popover-header">
        <h3 id="filter-popover-title" className="filter-popover-title">
          {title}
        </h3>
        <button
          className="filter-popover-close"
          onClick={onClose}
          aria-label="Filter schließen"
          type="button"
        >
          ×
        </button>
      </div>

      <div className="filter-popover-body">
        {children}
      </div>
    </div>
  );

  // Render in portal to avoid z-index issues
  return createPortal(popoverContent, document.body);
};

export default FilterPopover;
