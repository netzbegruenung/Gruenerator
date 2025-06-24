import React, { useRef, useCallback } from 'react';
import PropTypes from 'prop-types';

/**
 * Universal mode selector component for switching between different chat/interface modes
 * @param {Object} props - Component props
 * @param {string} props.currentMode - Currently active mode
 * @param {Object} props.modes - Object with mode keys and their config: { modeKey: { label, icon, title } }
 * @param {Function} props.onModeChange - Callback when mode changes
 * @param {Function} props.onReviewMode - Callback when long press triggers review mode
 * @param {string} props.className - Additional CSS class
 * @param {boolean} props.disabled - Whether selector is disabled
 */
const ModeSelector = ({
  currentMode,
  modes,
  onModeChange,
  onReviewMode,
  className = '',
  disabled = false
}) => {
  const modeKeys = Object.keys(modes);
  const longPressTimer = useRef(null);
  const isLongPress = useRef(false);
  
  // For two modes, use toggle behavior. For more than two, cycle through all
  const handleModeToggle = () => {
    if (disabled || isLongPress.current) return;
    
    if (modeKeys.length === 2) {
      // Toggle between two modes
      const otherMode = modeKeys.find(key => key !== currentMode);
      onModeChange(otherMode);
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

ModeSelector.propTypes = {
  currentMode: PropTypes.string.isRequired,
  modes: PropTypes.objectOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      icon: PropTypes.elementType,
      title: PropTypes.string
    })
  ).isRequired,
  onModeChange: PropTypes.func.isRequired,
  onReviewMode: PropTypes.func,
  className: PropTypes.string,
  disabled: PropTypes.bool
};

export default ModeSelector;