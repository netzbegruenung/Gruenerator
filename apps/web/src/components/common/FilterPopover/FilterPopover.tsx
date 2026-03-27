import { type JSX, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import useClickOutside from '../../../hooks/useClickOutside';
import { cn } from '../../../utils/cn';

interface FilterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  anchorRef?: React.RefObject<HTMLElement>;
  title?: string;
  className?: string;
}

const FilterPopover = ({
  isOpen,
  onClose,
  children,
  anchorRef,
  title = 'Filter',
  className = '',
}: FilterPopoverProps): JSX.Element | null => {
  const popoverRef = useClickOutside<HTMLDivElement>(onClose, isOpen);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Calculate position based on anchor element
  useEffect(() => {
    if (isOpen && anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const popoverWidth = 280; // min-width

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
      className={cn(
        'fixed bg-background-alt border border-grey-200 dark:border-grey-700',
        'rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]',
        'z-[1000] min-w-[280px] max-w-[400px] max-h-[80vh] overflow-y-auto',
        'animate-[filterPopoverFadeIn_0.2s_ease-out]',
        'max-md:bottom-5 max-md:left-5 max-md:right-5 max-md:top-auto max-md:min-w-0 max-md:max-w-none max-md:max-h-[60vh]',
        className
      )}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      role="dialog"
      aria-labelledby="filter-popover-title"
      aria-modal="true"
      tabIndex={-1}
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-grey-200 dark:border-grey-700">
        <h3 id="filter-popover-title" className="m-0 text-base font-semibold text-foreground-heading">
          {title}
        </h3>
        <button
          className={cn(
            'bg-transparent border-none text-xl text-foreground cursor-pointer',
            'p-1 -m-1 rounded-sm transition-colors duration-200',
            'flex items-center justify-center size-7',
            'hover:bg-hover-alt focus:outline-2 focus:outline-primary-600 focus:outline-offset-2'
          )}
          onClick={onClose}
          aria-label="Filter schließen"
          type="button"
        >
          ×
        </button>
      </div>

      <div className="px-5 pt-4 pb-5">{children}</div>
    </div>
  );

  // Render in portal to avoid z-index issues
  return createPortal(popoverContent, document.body);
};

export default FilterPopover;
