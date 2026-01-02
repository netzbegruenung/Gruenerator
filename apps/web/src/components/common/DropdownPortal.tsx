import { useRef, useEffect, useCallback, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface DropdownPortalProps {
  triggerRef: Record<string, unknown>;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  width?: 'auto' | 'trigger';
  widthRef?: Record<string, unknown>;
  minWidth?: number;
  gap?: number;
}

const DropdownPortal = ({ triggerRef,
  isOpen,
  onClose,
  children,
  className = '',
  width = 'auto',
  widthRef = null,
  minWidth = null,
  gap = 4 }: DropdownPortalProps): JSX.Element => {
  const [style, setStyle] = useState({ opacity: 0 });
  const dropdownRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef?.current || !dropdownRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const dropdownRect = dropdownRef.current.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const space = 8;

    // Calculate available space above and below
    const spaceBelow = windowHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    const dropdownHeight = dropdownRect.height || 200; // fallback for initial render

    // Open upward if not enough space below and more space above
    const openUpward = spaceBelow < dropdownHeight + gap && spaceAbove > spaceBelow;

    let top;
    if (openUpward) {
      top = triggerRect.top + window.scrollY - dropdownHeight - gap;
    } else {
      top = triggerRect.bottom + window.scrollY + gap;
    }

    // Calculate width based on widthRef if provided, otherwise use trigger
    let dropdownWidth;
    let referenceRect;

    if (widthRef?.current) {
      referenceRect = widthRef.current.getBoundingClientRect();
      dropdownWidth = referenceRect.width;
    } else if (width === 'trigger') {
      referenceRect = triggerRect;
      dropdownWidth = triggerRect.width;
    } else if (width === 'auto') {
      referenceRect = triggerRect;
      dropdownWidth = dropdownRect.width;
    } else {
      referenceRect = triggerRect;
      dropdownWidth = parseInt(width);
    }

    // Apply minimum width constraint
    if (minWidth && dropdownWidth < minWidth) {
      dropdownWidth = minWidth;
    }

    // Center the dropdown relative to the reference element
    let left = referenceRect.left + window.scrollX + (referenceRect.width / 2) - (dropdownWidth / 2);

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
      minWidth: minWidth ? `${minWidth}px` : undefined,
      opacity: 1,
      zIndex: 1000,
    });
  }, [triggerRef, width, widthRef, minWidth, gap]);

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

export default DropdownPortal;
