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
import '../../assets/styles/components/ui/tooltip.css';

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
    <div className={`help-tooltip-container ${className}`}>
      <button
        ref={triggerRef}
        className="help-tooltip-trigger"
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
          <div ref={tooltipRef} className="help-tooltip-content" style={style}>
            <div className="help-tooltip-arrow" />
            {children}
          </div>,
          document.body
        )}
    </div>
  );
};

export default HelpTooltip;
