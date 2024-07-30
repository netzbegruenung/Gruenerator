// useAccessibility.js
import { useEffect, useCallback } from 'react';
import {
  announceToScreenReader,
  setFocus,
  handleKeyboardNavigation,
  updateAriaLiveRegion
} from '../utils/accessibilityHelpers';

const useAccessibility = () => {
  useEffect(() => {
    const ariaLiveRegion = document.getElementById('aria-live-region');
    if (!ariaLiveRegion) {
      const region = document.createElement('div');
      region.id = 'aria-live-region';
      region.setAttribute('aria-live', 'polite');
      region.style.position = 'absolute';
      region.style.left = '-9999px';
      document.body.appendChild(region);
    }
  }, []);

  const announce = useCallback((message) => {
    announceToScreenReader(message);
    updateAriaLiveRegion(message);
  }, []);

  const focusElement = useCallback((elementId) => {
    setFocus(elementId);
  }, []);

  const setupKeyboardNav = useCallback((elements) => {
    const handleKeyDown = (event) => handleKeyboardNavigation(event, elements);
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { announce, focusElement, setupKeyboardNav };
};

export default useAccessibility;