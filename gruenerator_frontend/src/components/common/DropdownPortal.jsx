import React, { useRef, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';

const DropdownPortal = ({
  triggerRef,
  isOpen,
  onClose,
  children,
  className = '',
  width = 'auto'
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
    const overlap = 1;

    let top = triggerRect.bottom + window.scrollY - overlap;
    let left = triggerRect.left + window.scrollX;
    const dropdownWidth = width === 'auto' ? dropdownRect.width : triggerRect.width;

    if (left < space) {
      left = space;
    } else if (left + dropdownWidth > windowWidth - space) {
      left = windowWidth - dropdownWidth - space;
    }

    if (top + dropdownRect.height > windowHeight + window.scrollY - space) {
      top = triggerRect.top + window.scrollY - dropdownRect.height + overlap;
    }

    setStyle({
      position: 'absolute',
      top: `${top}px`,
      left: `${left}px`,
      width: width === 'trigger' ? `${triggerRect.width}px` : width,
      opacity: 1,
      zIndex: 1000,
    });
  }, [triggerRef, width]);

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
  ])
};

export default DropdownPortal;
