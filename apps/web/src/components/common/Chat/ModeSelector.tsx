import { JSX, useRef, useCallback, ComponentType } from 'react';

interface ModeConfig {
  label?: string;
  icon?: ComponentType;
  title?: string;
}

interface ModeSelectorProps {
  currentMode: string;
  modes: Record<string, ModeConfig>;
  onModeChange: (mode: string) => void;
  onReviewMode?: () => void;
  className?: string;
  disabled?: boolean;
}

const ModeSelector = ({ currentMode,
  modes,
  onModeChange,
  onReviewMode,
  className = '',
  disabled = false }: ModeSelectorProps): JSX.Element => {
  const modeKeys = Object.keys(modes);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef<boolean>(false);

  // For two modes, use toggle behavior. For more than two, cycle through all
  const handleModeToggle = () => {
    if (disabled || isLongPress.current) return;

    if (modeKeys.length === 2) {
      // Toggle between two modes
      const otherMode = modeKeys.find(key => key !== currentMode);
      onModeChange(otherMode as string);
    } else {
      // Cycle through multiple modes
      const currentIndex = modeKeys.indexOf(currentMode);
      const nextIndex = (currentIndex + 1) % modeKeys.length;
      onModeChange(modeKeys[nextIndex]);
    }
  };

  const handleMouseDown = useCallback(() => {
    if (disabled) return;

    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      if (onReviewMode) {
        onReviewMode();
      }
    }, 500); // 500ms for long press
  }, [disabled, onReviewMode]);

  const handleMouseUp = useCallback(() => {
    if (longPressTimer.current) {
      // Timer still running = short press
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      // isLongPress.current is already false, no need to change it
    } else {
      // Timer already fired = long press
      // Reset flag for next interaction after a brief delay
      setTimeout(() => {
        isLongPress.current = false;
      }, 50);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    isLongPress.current = false;
  }, []);

  const currentModeConfig = modes[currentMode];
  const IconComponent = currentModeConfig?.icon;
  const title = currentModeConfig?.title || `Switch to ${currentModeConfig?.label || 'next mode'}`;

  return (
    <div className={`mode-selector ${className}`}>
      <button
        type="button"
        className="mode-button"
        onClick={handleModeToggle}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleMouseDown}
        onTouchEnd={handleMouseUp}
        title={title}
        aria-label={title}
        disabled={disabled}
      >
        {IconComponent && <IconComponent />}
      </button>
    </div>
  );
};

export default ModeSelector;
