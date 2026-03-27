import { type JSX, useState, useRef, useEffect, useCallback, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { HiChevronDown, HiGlobe } from 'react-icons/hi';

import { NotebookIcon } from '../../config/icons';
import { cn } from '../../utils/cn';

import GrueneratorGPTIcon from './GrueneratorGPTIcon';

interface DropdownButtonProps {
  onCreateNotebook?: () => void;
  onCreateCustomGenerator?: () => void;
  onCreateSite?: () => void;
  showNotebook?: boolean;
  showSite?: boolean;
  className?: string;
  variant?: 'navigation' | 'content';
}

const DropdownButton = ({
  onCreateNotebook,
  onCreateCustomGenerator,
  onCreateSite,
  showNotebook = false,
  showSite = false,
  className = 'groups-action-button create-new-group-button',
  variant = 'navigation',
}: DropdownButtonProps): JSX.Element => {
  const [isOpen, setIsOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ opacity: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Count available options: Custom Grünerator is always available
  const optionCount = 1 + (showNotebook ? 1 : 0) + (showSite ? 1 : 0);
  const isSingleOption = optionCount === 1;

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !dropdownRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const dropdownRect = dropdownRef.current.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const space = 8;
    const overlap = 1; // slight overlap to avoid hover gap due to borders

    // Calculate initial position
    // Place directly under trigger and overlap by 1px to avoid gap
    let top = triggerRect.bottom + window.scrollY - overlap;
    let left = triggerRect.left + window.scrollX;

    // Adjust horizontal position if it overflows
    if (left < space) {
      left = space;
    } else if (left + dropdownRect.width > windowWidth - space) {
      left = windowWidth - dropdownRect.width - space;
    }

    // Adjust vertical position if it overflows
    if (top + dropdownRect.height > windowHeight + window.scrollY - space) {
      // Place above trigger with slight overlap
      top = triggerRect.top + window.scrollY - dropdownRect.height + overlap;
    }

    setStyle({
      position: 'absolute',
      top: `${top}px`,
      left: `${left}px`,
      opacity: 1,
      zIndex: 1000,
    });
  }, []);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsOpen(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    // Small delay prevents flicker when moving cursor between button and menu
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      closeTimeoutRef.current = null;
    }, 120);
  }, []);

  // Handle click outside to close and position dropdown
  useEffect(() => {
    if (isOpen) {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          triggerRef.current &&
          !triggerRef.current.contains(event.target as Node) &&
          dropdownRef.current &&
          !dropdownRef.current.contains(event.target as Node)
        ) {
          handleClose();
        }
      };

      const handleScroll = () => {
        updatePosition();
      };

      const handleResize = () => {
        handleClose();
      };

      // Add event listeners
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);

      // Position dropdown after render
      const positionFrame = requestAnimationFrame(() => {
        updatePosition();
      });

      return () => {
        cancelAnimationFrame(positionFrame);
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    } else {
      setStyle((prev) => ({ ...prev, opacity: 0 }));
    }
  }, [isOpen, updatePosition, handleClose]);

  const buttonClasses = cn(
    'button flex items-center gap-sm w-full no-underline',
    variant === 'content' && [
      'justify-between bg-secondary-600 text-white border border-secondary-600 min-w-[180px]',
      'hover:not-disabled:bg-secondary-700 hover:not-disabled:border-secondary-700 hover:not-disabled:-translate-y-px',
    ],
    variant === 'navigation' && [
      'justify-start px-lg py-xs bg-background border border-grey-200 dark:border-grey-700 rounded-[20px]',
      'text-[0.9rem] font-medium leading-[1.3] text-foreground transition-all duration-200',
      'hover:not-disabled:bg-background-alt hover:not-disabled:border-accent hover:not-disabled:text-accent',
    ],
    variant !== 'content' &&
      variant !== 'navigation' && [
        'justify-between bg-transparent text-foreground border border-grey-200 dark:border-grey-700',
      ]
  );

  const chevronClasses = cn(
    'text-[0.8rem] ml-sm transition-transform duration-150 ease-in-out',
    variant === 'content'
      ? 'text-white/80 group-hover:text-white'
      : 'text-grey-400 group-hover:text-foreground',
    isOpen && 'rotate-180'
  );

  // Single option: render simple button that directly creates
  if (isSingleOption) {
    return (
      <div className="relative w-full">
        <button
          className={cn(buttonClasses, 'single-option')}
          onClick={() => onCreateCustomGenerator && onCreateCustomGenerator()}
          aria-label="Neuen Custom Grünerator erstellen"
        >
          <span>Neu erstellen</span>
        </button>
      </div>
    );
  }

  // Multiple options: render dropdown
  return (
    <div
      className="group relative w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={triggerRef}
        className={cn('group', buttonClasses)}
        onClick={handleToggle}
        aria-label="Neu erstellen"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <span>Neu erstellen</span>
        <HiChevronDown className={chevronClasses} />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className={cn(
              'bg-background border border-grey-200 dark:border-grey-700 rounded-lg shadow-card-floating',
              'min-w-[180px] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150',
              'md:min-w-[180px] max-md:min-w-[160px]'
            )}
            style={style}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            role="menu"
          >
            <button
              className={cn(
                'flex items-center gap-sm p-sm w-full text-left text-sm text-foreground',
                'bg-transparent border-none rounded-xs cursor-pointer mb-0.5 last:mb-0',
                'transition-colors duration-150 hover:bg-hover-alt',
                '[&>svg]:text-[16px] [&>svg]:text-grey-400 [&>svg]:transition-colors [&>svg]:duration-150',
                'hover:[&>svg]:text-foreground'
              )}
              onClick={() => {
                onCreateCustomGenerator?.();
                handleClose();
              }}
              aria-label="Neuen Custom Grünerator erstellen"
              role="menuitem"
            >
              <GrueneratorGPTIcon />
              <span>Custom Grünerator</span>
            </button>

            {showNotebook && (
              <button
                className={cn(
                  'flex items-center gap-sm p-sm w-full text-left text-sm text-foreground',
                  'bg-transparent border-none rounded-xs cursor-pointer mb-0.5 last:mb-0',
                  'transition-colors duration-150 hover:bg-hover-alt',
                  '[&>svg]:text-[16px] [&>svg]:text-grey-400 [&>svg]:transition-colors [&>svg]:duration-150',
                  'hover:[&>svg]:text-foreground'
                )}
                onClick={() => {
                  onCreateNotebook?.();
                  handleClose();
                }}
                aria-label="Neues Notebook erstellen"
                role="menuitem"
              >
                <NotebookIcon />
                <span>Notebook</span>
              </button>
            )}

            {showSite && (
              <button
                className={cn(
                  'flex items-center gap-sm p-sm w-full text-left text-sm text-foreground',
                  'bg-transparent border-none rounded-xs cursor-pointer mb-0.5 last:mb-0',
                  'transition-colors duration-150 hover:bg-hover-alt',
                  '[&>svg]:text-[16px] [&>svg]:text-grey-400 [&>svg]:transition-colors [&>svg]:duration-150',
                  'hover:[&>svg]:text-foreground'
                )}
                onClick={() => {
                  onCreateSite?.();
                  handleClose();
                }}
                aria-label="Neue Site erstellen"
                role="menuitem"
              >
                <HiGlobe />
                <span>Site</span>
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

export default DropdownButton;
