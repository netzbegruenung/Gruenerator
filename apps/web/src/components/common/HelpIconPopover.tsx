import React, { useState, useRef, useEffect } from 'react';
import { PiQuestion } from 'react-icons/pi';

import type { HelpContent } from '@/types/baseform';
import { cn } from '../../utils/cn';

interface HelpIconPopoverProps {
  helpContent?: HelpContent | null;
  className?: string;
}

const HelpIconPopover: React.FC<HelpIconPopoverProps> = ({ helpContent, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  if (!helpContent?.content && (!helpContent?.tips || helpContent.tips.length === 0)) {
    return null;
  }

  return (
    <div className={cn('relative inline-flex', className)}>
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          'flex items-center justify-center w-7 h-7 p-0 border-none rounded-full',
          'bg-transparent text-foreground opacity-50 cursor-pointer',
          'transition-[opacity,background] duration-200 ease-in-out',
          '[&_svg]:w-[18px] [&_svg]:h-[18px]',
          'hover:opacity-100 hover:bg-background-alt',
          isOpen && 'opacity-100 bg-background-alt'
        )}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Hilfe anzeigen"
        aria-expanded={isOpen}
      >
        <PiQuestion />
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className={cn(
            'absolute top-[calc(100%+8px)] right-0 z-[100]',
            'min-w-[280px] max-w-[360px] p-md',
            'bg-background border border-grey-200 dark:border-grey-700 rounded-md',
            'shadow-lg'
          )}
          role="tooltip"
        >
          <div className="flex flex-col gap-sm">
            {helpContent.content && (
              <p className="m-0 text-sm leading-relaxed text-foreground">{helpContent.content}</p>
            )}
            {helpContent.tips && helpContent.tips.length > 0 && (
              <ul className="m-0 pl-md list-disc">
                {helpContent.tips.map((tip, index) => (
                  <li
                    key={index}
                    className="text-sm leading-relaxed text-foreground opacity-80 mb-xs last:mb-0"
                  >
                    {tip}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HelpIconPopover;
