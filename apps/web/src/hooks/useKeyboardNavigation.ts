/**
 * useKeyboardNavigation Hook
 * 
 * Provides keyboard navigation patterns for tabs, lists, and other navigable components.
 * Supports arrow keys, Tab/Shift+Tab, Enter/Space activation, and Escape handling.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook for vertical tab navigation with arrow keys
 * @param {Object} options Configuration options
 * @param {string[]} options.items - Array of item identifiers
 * @param {string} options.activeItem - Currently active item
 * @param {Function} options.onItemSelect - Callback when item is selected
 * @param {boolean} options.loop - Whether to loop at start/end (default: true)
 * @param {boolean} options.horizontal - Use left/right instead of up/down (default: false)
 * @param {string} options.containerRef - Ref to the container element
 * @returns {Object} Handlers and utilities for keyboard navigation
 */
export const useVerticalTabNavigation = ({
  items,
  activeItem,
  onItemSelect,
  loop = true,
  horizontal = false,
  containerRef
}) => {
  const itemRefs = useRef({});

  // Get next/previous item index
  const getNextIndex = useCallback((currentIndex, direction) => {
    const maxIndex = items.length - 1;
    let nextIndex = currentIndex + direction;

    if (loop) {
      if (nextIndex < 0) nextIndex = maxIndex;
      if (nextIndex > maxIndex) nextIndex = 0;
    } else {
      nextIndex = Math.max(0, Math.min(maxIndex, nextIndex));
    }

    return nextIndex;
  }, [items.length, loop]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event) => {
    const currentIndex = items.indexOf(activeItem);
    if (currentIndex === -1) return;

    const upKey = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const downKey = horizontal ? 'ArrowRight' : 'ArrowDown';

    switch (event.key) {
      case upKey:
        event.preventDefault();
        const prevIndex = getNextIndex(currentIndex, -1);
        onItemSelect(items[prevIndex]);
        break;

      case downKey:
        event.preventDefault();
        const nextIndex = getNextIndex(currentIndex, 1);
        onItemSelect(items[nextIndex]);
        break;

      case 'Home':
        event.preventDefault();
        onItemSelect(items[0]);
        break;

      case 'End':
        event.preventDefault();
        onItemSelect(items[items.length - 1]);
        break;

      case 'Enter':
      case ' ':
        event.preventDefault();
        // Trigger click on the focused element
        if (itemRefs.current[activeItem]) {
          itemRefs.current[activeItem].click();
        }
        break;

      default:
        break;
    }
  }, [activeItem, items, onItemSelect, getNextIndex, horizontal]);

  // Set up event listener on container
  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, handleKeyDown]);

  // Focus active item when it changes
  useEffect(() => {
    const activeRef = itemRefs.current[activeItem];
    if (activeRef && document.activeElement?.closest('[role="tablist"]')) {
      activeRef.focus();
    }
  }, [activeItem]);

  // Register item ref
  const registerItemRef = useCallback((item, ref) => {
    if (ref) {
      itemRefs.current[item] = ref;
    } else {
      delete itemRefs.current[item];
    }
  }, []);

  return {
    handleKeyDown,
    registerItemRef,
    tabIndex: (item) => item === activeItem ? 0 : -1,
    ariaSelected: (item) => item === activeItem
  };
};

/**
 * Hook for modal focus management
 * @param {Object} options Configuration options
 * @param {boolean} options.isOpen - Whether modal is open
 * @param {React.RefObject} options.modalRef - Ref to modal container
 * @param {React.RefObject} options.initialFocusRef - Ref to element to focus on open
 * @param {React.RefObject} options.returnFocusRef - Ref to element to return focus on close
 * @returns {Object} Focus management utilities
 */
export const useModalFocus = ({
  isOpen,
  modalRef,
  initialFocusRef,
  returnFocusRef
}) => {
  const previousActiveElement = useRef(null);

  // Store and restore focus
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement;
      
      // Focus initial element or first focusable element
      setTimeout(() => {
        if (initialFocusRef?.current) {
          initialFocusRef.current.focus();
        } else {
          const firstFocusable = modalRef.current?.querySelector(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          firstFocusable?.focus();
        }
      }, 0);
    } else if (previousActiveElement.current) {
      // Return focus to previous element or specified return element
      const elementToFocus = returnFocusRef?.current || previousActiveElement.current;
      if (elementToFocus && document.body.contains(elementToFocus)) {
        elementToFocus.focus();
      }
      previousActiveElement.current = null;
    }
  }, [isOpen, modalRef, initialFocusRef, returnFocusRef]);

  // Trap focus within modal
  const handleKeyDown = useCallback((event) => {
    if (!isOpen || !modalRef.current) return;

    if (event.key === 'Tab') {
      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const focusableArray = Array.from(focusableElements);
      const firstFocusable = focusableArray[0];
      const lastFocusable = focusableArray[focusableArray.length - 1];

      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        (lastFocusable as HTMLElement)?.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        (firstFocusable as HTMLElement)?.focus();
      }
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      // Let parent component handle close action
      modalRef.current.dispatchEvent(new CustomEvent('escapeKey'));
    }
  }, [isOpen, modalRef]);

  // Set up event listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return {
    trapFocus: handleKeyDown
  };
};

/**
 * Hook for skip link functionality
 * @param {string} targetId - ID of element to skip to
 * @returns {Object} Skip link handlers
 */
export const useSkipLink = (targetId) => {
  const handleSkipClick = useCallback((event) => {
    event.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.setAttribute('tabindex', '-1');
      target.focus();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [targetId]);

  return {
    href: `#${targetId}`,
    onClick: handleSkipClick
  };
};

/**
 * Hook for roving tabindex pattern
 * @param {Object} options Configuration options
 * @param {string[]} options.items - Array of item identifiers
 * @param {string} options.defaultActiveItem - Default active item
 * @returns {Object} Roving tabindex utilities
 */
export const useRovingTabindex = ({ items, defaultActiveItem }) => {
  const [activeItem, setActiveItem] = useState(defaultActiveItem || items[0]);
  const itemRefs = useRef({});

  const handleKeyDown = useCallback((event) => {
    const currentIndex = items.indexOf(activeItem);
    let nextItem = null;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        nextItem = items[(currentIndex + 1) % items.length];
        break;

      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        nextItem = items[(currentIndex - 1 + items.length) % items.length];
        break;

      case 'Home':
        event.preventDefault();
        nextItem = items[0];
        break;

      case 'End':
        event.preventDefault();
        nextItem = items[items.length - 1];
        break;

      default:
        return;
    }

    if (nextItem) {
      setActiveItem(nextItem);
      itemRefs.current[nextItem]?.focus();
    }
  }, [activeItem, items]);

  const registerItemRef = useCallback((item, ref) => {
    if (ref) {
      itemRefs.current[item] = ref;
    } else {
      delete itemRefs.current[item];
    }
  }, []);

  const getItemProps = useCallback((item) => ({
    ref: (ref) => registerItemRef(item, ref),
    tabIndex: item === activeItem ? 0 : -1,
    onKeyDown: handleKeyDown,
    onClick: () => setActiveItem(item),
    'aria-selected': item === activeItem
  }), [activeItem, handleKeyDown, registerItemRef]);

  return {
    activeItem,
    setActiveItem,
    getItemProps
  };
};

export default {
  useVerticalTabNavigation,
  useModalFocus,
  useSkipLink,
  useRovingTabindex
};