import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const MenuDropdown = ({ trigger, children, onClose, className = '', alignRight = true }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [style, setStyle] = useState({ opacity: 0 });
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      
      // Initial positioning based on trigger, even if dropdown isn't measured yet
      let top = triggerRect.bottom + window.scrollY + 4;
      let left = triggerRect.right + window.scrollX - 140; // Assume 140px dropdown width
      
      if (dropdownRef.current) {
        // More precise positioning when dropdown is measured
        const dropdownRect = dropdownRef.current.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const space = 8;

        if (alignRight) {
          left = triggerRect.right + window.scrollX - dropdownRect.width;
        } else {
          left = triggerRect.left + window.scrollX;
        }

        // Adjust horizontal position if it overflows
        if (left < space) {
          left = space;
        } else if (left + dropdownRect.width > windowWidth - space) {
          left = windowWidth - dropdownRect.width - space;
        }

        // Adjust vertical position if it overflows
        if (top + dropdownRect.height > windowHeight + window.scrollY - space) {
          top = triggerRect.top + window.scrollY - dropdownRect.height - 4;
        }
      }

      setStyle({
        position: 'absolute',
        top: `${top}px`,
        left: `${left}px`,
        opacity: 1,
        transition: 'opacity 0.15s ease-in',
      });
    }
  }, [alignRight]);

  const handleToggle = useCallback((e) => {
    e.stopPropagation();
    setIsOpen(prev => {
      const newState = !prev;
      if (newState) {
        // Immediate positioning attempt
        setTimeout(updatePosition, 0);
      }
      return newState;
    });
  }, [updatePosition]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    if (onClose) onClose();
  }, [onClose]);

  // Handle click outside to close
  useEffect(() => {
    if (isOpen) {
      const handleClickOutside = (event) => {
        if (
          triggerRef.current && 
          !triggerRef.current.contains(event.target) &&
          dropdownRef.current && 
          !dropdownRef.current.contains(event.target)
        ) {
          handleClose();
        }
      };

      const handleScroll = () => {
        updatePosition();
      };

      const handleResize = () => {
        handleClose();
      };

      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);

      // Position dropdown after render with multiple retries to ensure proper measurement
      const timer1 = setTimeout(updatePosition, 0);
      const timer2 = setTimeout(updatePosition, 10);
      const timer3 = setTimeout(updatePosition, 50);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    } else {
      setStyle({ opacity: 0 });
    }
  }, [isOpen, updatePosition, handleClose]);

  return (
    <div className={`menu-dropdown-container ${className}`}>
      <div ref={triggerRef} onClick={handleToggle}>
        {trigger}
      </div>
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="menu-dropdown-content"
          style={style}
        >
          {React.cloneElement(children, { onClose: handleClose })}
        </div>,
        document.body
      )}
    </div>
  );
};

export default MenuDropdown;