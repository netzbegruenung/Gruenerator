import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HiQuestionMarkCircle } from 'react-icons/hi';
import '../../assets/styles/components/ui/tooltip.css';

const HelpTooltip = ({ children, className = '' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [style, setStyle] = useState({ opacity: 0 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const windowWidth = window.innerWidth;

      const space = 16; // Viewport edge margin

      // Start with centered position
      let left = triggerRect.left + window.scrollX + triggerRect.width / 2;

      // The CSS transformX(-50%) centers the tooltip.
      // We calculate where the edges *would* be.
      const tooltipLeftEdge = left - tooltipRect.width / 2;
      const tooltipRightEdge = left + tooltipRect.width / 2;
      
      // Adjust if it overflows
      if (tooltipRightEdge > windowWidth - space) {
        left = windowWidth - tooltipRect.width / 2 - space;
      }
      if (tooltipLeftEdge < space) {
        left = tooltipRect.width / 2 + space;
      }
      
      setStyle({
        position: 'absolute',
        top: `${triggerRect.bottom + window.scrollY + 4}px`, // 4px for --spacing-xxsmall
        left: `${left}px`,
        opacity: 1,
        transition: 'opacity 0.15s ease-in',
      });
    }
  }, []);

  useEffect(() => {
    if (isVisible) {
      // Position is updated after the tooltip is rendered and measured
      const timer = setTimeout(updatePosition, 0);
      document.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        clearTimeout(timer);
        document.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    } else {
      setStyle({ opacity: 0 });
    }
  }, [isVisible, updatePosition]);

  return (
    <div className={`help-tooltip-container ${className}`}>
      <button
        ref={triggerRef}
        className="help-tooltip-trigger"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={(e) => { e.preventDefault(); setIsVisible(p => !p); }}
        type="button"
        aria-label="Hilfe anzeigen"
      >
        <HiQuestionMarkCircle />
      </button>
      {isVisible && createPortal(
        <div
          ref={tooltipRef}
          className="help-tooltip-content"
          style={style}
        >
          <div className="help-tooltip-arrow"></div>
          {children}
        </div>,
        document.body
      )}
    </div>
  );
};

export default HelpTooltip;