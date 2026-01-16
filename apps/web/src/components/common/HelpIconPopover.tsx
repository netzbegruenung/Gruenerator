import React, { useState, useRef, useEffect } from 'react';
import { PiQuestion } from 'react-icons/pi';
import type { HelpContent } from '@/types/baseform';
import './HelpIconPopover.css';

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
    <div className={`help-icon-popover ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        className={`help-icon-button ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Hilfe anzeigen"
        aria-expanded={isOpen}
      >
        <PiQuestion />
      </button>

      {isOpen && (
        <div ref={popoverRef} className="help-popover" role="tooltip">
          <div className="help-popover-content">
            {helpContent.content && (
              <p className="help-popover-description">{helpContent.content}</p>
            )}
            {helpContent.tips && helpContent.tips.length > 0 && (
              <ul className="help-popover-tips">
                {helpContent.tips.map((tip, index) => (
                  <li key={index}>{tip}</li>
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
