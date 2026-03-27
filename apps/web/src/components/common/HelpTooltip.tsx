import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { HiQuestionMarkCircle } from 'react-icons/hi';

import { cn } from '../../utils/cn';

export interface HelpTooltipProps {
  children: ReactNode;
  className?: string;
}

interface TooltipStyle extends CSSProperties {
  opacity: number;
}

const HelpTooltip = ({ children, className = '' }: HelpTooltipProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [style, setStyle] = useState<TooltipStyle>({ opacity: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const windowWidth = window.innerWidth;

      const space = 16;

      let left = triggerRect.left + window.scrollX + triggerRect.width / 2;

      const tooltipLeftEdge = left - tooltipRect.width / 2;
      const tooltipRightEdge = left + tooltipRect.width / 2;

      if (tooltipRightEdge > windowWidth - space) {
        left = windowWidth - tooltipRect.width / 2 - space;
      }
      if (tooltipLeftEdge < space) {
        left = tooltipRect.width / 2 + space;
      }

      setStyle({
        position: 'absolute',
        top: `${triggerRect.bottom + window.scrollY + 4}px`,
        left: `${left}px`,
        opacity: 1,
        transition: 'opacity 0.15s ease-in',
      });
    }
  }, []);

  useEffect(() => {
    if (isVisible) {
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
    <div className={cn('relative inline-flex items-center', className)}>
      <button
        ref={triggerRef}
        className="inline-flex items-center justify-center bg-transparent border-none cursor-pointer p-0 text-foreground opacity-60 hover:opacity-100 transition-opacity"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={(e: React.MouseEvent) => {
          e.preventDefault();
          setIsVisible((p) => !p);
        }}
        type="button"
        aria-label="Hilfe anzeigen"
      >
        <HiQuestionMarkCircle />
      </button>
      {isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            className="z-[9999] bg-[var(--dunkelgruen)] text-white rounded px-3 py-2 text-sm -translate-x-1/2 max-w-[300px] shadow-lg"
            style={style}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full w-0 h-0 border-x-[6px] border-x-transparent border-b-[6px] border-b-[var(--dunkelgruen)]" />
            {children}
          </div>,
          document.body
        )}
    </div>
  );
};

export default HelpTooltip;
