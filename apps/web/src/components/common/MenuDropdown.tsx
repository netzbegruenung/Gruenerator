import React, { useState, useRef, useEffect, useCallback, ReactNode, ReactElement } from 'react';
import { createPortal } from 'react-dom';
import '../../assets/styles/components/ui/menu-dropdown.css';

interface MenuDropdownProps {
  trigger: ReactNode;
  children: ReactNode | ((props: { onClose: () => void }) => ReactNode);
  onClose?: () => void;
  className?: string;
  alignRight?: boolean;
}

const MenuDropdown = ({ trigger, children, onClose, className = '', alignRight = true }: MenuDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !dropdownRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const dropdownRect = dropdownRef.current.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const space = 8;

    // Calculate initial position
    let top = triggerRect.bottom + window.scrollY + 4;
    let left = alignRight
      ? triggerRect.right + window.scrollX - dropdownRect.width
      : triggerRect.left + window.scrollX;

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

    setStyle({
      position: 'absolute',
      top: `${top}px`,
      left: `${left}px`,
      opacity: 1,
    });
  }, [alignRight]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(prev => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    if (onClose) onClose();
  }, [onClose]);

  // Handle click outside to close and position dropdown
  useEffect(() => {
    if (isOpen) {
      const handleClickOutside = (event: MouseEvent) => {
        // Improved click outside detection
        if (
          triggerRef.current &&
          !triggerRef.current.contains(event.target as Node) &&
          dropdownRef.current &&
          !dropdownRef.current.contains(event.target as Node)
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

      // Add event listeners
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);

      // Position dropdown after render - single attempt with requestAnimationFrame
      const positionFrame = requestAnimationFrame(() => {
        updatePosition();
      });

      return () => {
        cancelAnimationFrame(positionFrame);
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    } else {
      setStyle(prev => ({ ...prev, opacity: 0 }));
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
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {typeof children === 'function'
            ? children({ onClose: handleClose })
            : React.isValidElement(children)
              ? React.cloneElement(children, { onClose: handleClose } as React.Attributes)
              : children
          }
        </div>,
        document.body
      )}
    </div>
  );
};

export default MenuDropdown;
