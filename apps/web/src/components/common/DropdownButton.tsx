import { type JSX, useState, useRef, useEffect, useCallback, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { HiChevronDown, HiGlobe } from 'react-icons/hi';
import { Link } from 'react-router-dom';

import { NotebookIcon } from '../../config/icons';

import GrueneratorGPTIcon from './GrueneratorGPTIcon';
import '../../assets/styles/components/ui/dropdown-button.css';

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

  // Single option: render simple button that directly creates
  if (isSingleOption) {
    return (
      <div className={`dropdown-button-container ${variant}-variant`}>
        <button
          className="button dropdown-button single-option"
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
      className={`dropdown-button-container ${variant}-variant`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={triggerRef}
        className="button dropdown-button"
        onClick={handleToggle}
        aria-label="Neu erstellen"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <span>Neu erstellen</span>
        <HiChevronDown className={`dropdown-chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="dropdown-button-content"
            style={style}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            role="menu"
          >
            <button
              className="dropdown-button-option"
              onClick={() => {
                onCreateCustomGenerator && onCreateCustomGenerator();
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
                className="dropdown-button-option"
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
                className="dropdown-button-option"
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
