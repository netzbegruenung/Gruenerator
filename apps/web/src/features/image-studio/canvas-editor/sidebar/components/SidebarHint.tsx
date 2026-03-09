import { useState, useRef, useEffect } from 'react';
import { FaQuestionCircle, FaTimes } from 'react-icons/fa';

import { SIDEBAR_HINT } from '../primitives';

import { cn } from '@/utils/cn';

interface SidebarHintProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function SidebarHint({ children, className, style }: SidebarHintProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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
      <p className={cn(SIDEBAR_HINT, 'block max-canvas-mobile:hidden', className)} style={style}>
        {children}
      </p>

      {/* Mobile: question mark button + popup */}
      <div className="hidden max-canvas-mobile:inline-flex max-canvas-mobile:relative">
        <button
          ref={buttonRef}
          type="button"
          className="flex items-center justify-center size-7 p-0 bg-[var(--card-background)] border border-[var(--border-subtle)] rounded-full text-foreground-muted cursor-pointer transition-[color,border-color] duration-150 hover:text-[var(--interactive-accent-color)] hover:border-[var(--interactive-accent-color)] focus:text-[var(--interactive-accent-color)] focus:border-[var(--interactive-accent-color)] focus:outline-none"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Hinweis anzeigen"
          aria-expanded={isOpen}
        >
          <FaQuestionCircle size={16} />
        </button>

        {isOpen && (
          <div
            ref={popupRef}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 w-[calc(100vw-2rem)] max-w-[320px] bg-background border border-[var(--card-border)] rounded-[var(--card-border-radius)] shadow-[0_4px_20px_rgba(0,0,0,0.15)] z-[1000] animate-[sidebar-hint-popup-in_0.2s_ease-out]"
            role="tooltip"
          >
            <button
              type="button"
              className="absolute top-2 right-2 flex items-center justify-center size-6 p-0 bg-transparent border-none text-foreground-muted cursor-pointer rounded-full transition-[background,color] duration-150 hover:bg-hover-alt hover:text-foreground"
              onClick={() => setIsOpen(false)}
              aria-label="Schließen"
            >
              <FaTimes size={12} />
            </button>
            <div className="p-md pr-[calc(var(--spacing-medium)+24px)] text-[10px] text-foreground-muted leading-relaxed">
              {children}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
