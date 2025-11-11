import React, { useRef, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';

const DropdownPortal = ({
  triggerRef,
  isOpen,
  onClose,
  children,
  className = '',
  width = 'auto',
  widthRef = null,
  gap = 4
}) => {
  const [style, setStyle] = useState({ opacity: 0 });
  const dropdownRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef?.current || !dropdownRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const dropdownRect = dropdownRef.current.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const space = 8;

    let top = triggerRect.bottom + window.scrollY + gap;
    let left = triggerRect.left + window.scrollX;

    // Calculate width based on widthRef if provided, otherwise use trigger
    let dropdownWidth;
    if (widthRef?.current) {
      const widthRect = widthRef.current.getBoundingClientRect();
      dropdownWidth = widthRect.width;
      left = widthRect.left + window.scrollX;
    } else if (width === 'trigger') {
      dropdownWidth = triggerRect.width;
    } else if (width === 'auto') {
      dropdownWidth = dropdownRect.width;
    } else {
      dropdownWidth = parseInt(width);
    }

    if (left < space) {
      left = space;
    } else if (left + dropdownWidth > windowWidth - space) {
      left = windowWidth - dropdownWidth - space;
    }

    setStyle({
      position: 'absolute',
      top: `${top}px`,
      left: `${left}px`,
      width: widthRef?.current ? `${dropdownWidth}px` : (width === 'trigger' ? `${triggerRect.width}px` : width),
      opacity: 1,
      zIndex: 1000,
    });
  }, [triggerRef, width, widthRef, gap]);

  useEffect(() => {
    if (isOpen) {
      const handleClickOutside = (event) => {
        if (
          triggerRef?.current &&
          !triggerRef.current.contains(event.target) &&
          dropdownRef.current &&
          !dropdownRef.current.contains(event.target)
        ) {
          onClose();
        }
      };

      const handleScroll = () => {
        updatePosition();
      };

      const handleResize = () => {
        onClose();
      };

      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);

      const positionFrame = requestAnimationFrame(() => {
        updatePosition();
      });

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(positionFrame);
      };
    }
  }, [isOpen, updatePosition, onClose, triggerRef]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      className={className}
      style={style}
    >
      {children}
    </div>,
    document.body
  );
};

DropdownPortal.propTypes = {
  triggerRef: PropTypes.object.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  width: PropTypes.oneOfType([
    PropTypes.oneOf(['auto', 'trigger']),
    PropTypes.string
  ]),
  widthRef: PropTypes.object,
  gap: PropTypes.number
};

export default DropdownPortal;
