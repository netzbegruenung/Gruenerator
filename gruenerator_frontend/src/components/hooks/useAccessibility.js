// useAccessibility.js
import { useEffect, useCallback, useRef } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  announceToScreenReader,
  setFocus,
  handleKeyboardNavigation,
  updateAriaLiveRegion,
  setupEnhancedKeyboardNavigation,
  enhanceAriaSupport,
  announceFormError,
  announceFormSuccess,
  detectAccessibilityPreferences,
  applyAccessibilityPreferences,
  createAriaLiveRegion
} from '../utils/accessibilityHelpers';

const useAccessibility = (options = {}) => {
  const formRef = useRef(null);
  const cleanupFunctions = useRef([]);

  const {
    enableEnhancedNavigation = true,
    enableAriaSupport = true,
    enableErrorAnnouncements = true,
    enableSuccessAnnouncements = true,
    keyboardNavigationOptions = {}
  } = options;

  // Initialize essential accessibility features only
  useEffect(() => {
    // Only create essential aria-live regions - reduce duplication
    // Most screen readers handle form announcements natively
    createAriaLiveRegion('form-error-announcer', 'assertive');
    
    // Remove duplicate sr-announcer - form-error-announcer serves the same purpose
    const existingSrAnnouncer = document.getElementById('sr-announcer');
    if (existingSrAnnouncer) {
      existingSrAnnouncer.remove();
    }
  }, []);

  // Setup enhanced accessibility when form ref is available
  useEffect(() => {
    if (!formRef.current) return;

    const formElement = formRef.current;

    // Apply user accessibility preferences
    const preferences = applyAccessibilityPreferences(formElement);

    // Setup enhanced keyboard navigation
    if (enableEnhancedNavigation) {
      const cleanup = setupEnhancedKeyboardNavigation(formElement, keyboardNavigationOptions);
      if (cleanup) {
        cleanupFunctions.current.push(cleanup);
      }
    }

    // Enhance ARIA support
    if (enableAriaSupport) {
      enhanceAriaSupport(formElement);
    }

    // Cleanup function
    return () => {
      cleanupFunctions.current.forEach(cleanup => {
        if (typeof cleanup === 'function') {
          cleanup();
        }
      });
      cleanupFunctions.current = [];
    };
  }, [enableEnhancedNavigation, enableAriaSupport, keyboardNavigationOptions]);

  const announce = useCallback((message) => {
    announceToScreenReader(message);
    updateAriaLiveRegion(message);
  }, []);

  const focusElement = useCallback((elementId) => {
    setFocus(elementId);
  }, []);

  const setupKeyboardNav = useCallback((elements) => {
    // DEPRECATED: Custom keyboard navigation removed - browser handles this natively
    // Function kept for backward compatibility but no longer sets up global listeners
    console.warn('setupKeyboardNav is deprecated - browser handles keyboard navigation natively');
    return () => {}; // Return empty cleanup function
  }, []);

  const manageFocusTrap = useCallback((trapActive, containerRef, options = {}) => {
    if (containerRef.current) {
      if (trapActive) {
        // Focus trap is managed by the FocusTrap component in JSX
        // This hook provides configuration and state management
      } else {
        // Focus trap should be inactive
      }
    }
    return trapActive;
  }, []);

  // Enhanced error handling with announcements
  const handleFormError = useCallback((errorMessage, fieldName = '') => {
    if (enableErrorAnnouncements) {
      announceFormError(errorMessage, fieldName);
    }
  }, [enableErrorAnnouncements]);

  // Enhanced success handling with announcements
  const handleFormSuccess = useCallback((message) => {
    if (enableSuccessAnnouncements) {
      announceFormSuccess(message);
    }
  }, [enableSuccessAnnouncements]);

  // Function to register form element
  const registerFormElement = useCallback((element) => {
    formRef.current = element;
  }, []);

  // Get accessibility preferences
  const getAccessibilityPreferences = useCallback(() => {
    return detectAccessibilityPreferences();
  }, []);

  // Minimal focus management - use sparingly to avoid screen reader conflicts
  const manageFocusSequence = useCallback((elements, startIndex = 0) => {
    if (!elements || elements.length === 0) return;
    
    console.warn('manageFocusSequence: Programmatic focus management can interfere with screen readers - use browser native focus instead');
    
    let currentIndex = startIndex;
    
    const focusNext = () => {
      // Only move focus if user explicitly requested it, don't auto-focus
      if (currentIndex < elements.length - 1) {
        currentIndex++;
        // Let browser/screen reader handle focus timing
        setTimeout(() => elements[currentIndex]?.focus(), 0);
      }
    };
    
    const focusPrevious = () => {
      if (currentIndex > 0) {
        currentIndex--;
        setTimeout(() => elements[currentIndex]?.focus(), 0);
      }
    };
    
    const focusCurrent = () => {
      setTimeout(() => elements[currentIndex]?.focus(), 0);
    };
    
    // Don't auto-focus on creation - let screen reader maintain current position
    
    return {
      focusNext,
      focusPrevious,
      focusCurrent,
      getCurrentIndex: () => currentIndex,
      setCurrentIndex: (index) => {
        if (index >= 0 && index < elements.length) {
          currentIndex = index;
          // Don't auto-focus, just update index
        }
      }
    };
  }, []);

  // Accessibility testing helpers (for development)
  const testAccessibility = useCallback(() => {
    if (process.env.NODE_ENV !== 'development') return;
    
    const formElement = formRef.current;
    if (!formElement) return;
    
    const report = {
      hasAriaLabels: [],
      missingLabels: [],
      hasRoles: [],
      missingRoles: [],
      focusableElements: [],
      accessibilityPreferences: getAccessibilityPreferences()
    };
    
    // Check ARIA labels
    const labeledElements = formElement.querySelectorAll('[aria-label], [aria-labelledby]');
    report.hasAriaLabels = Array.from(labeledElements).map(el => ({
      tag: el.tagName,
      id: el.id,
      label: el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
    }));
    
    // Check for missing labels on inputs
    const inputs = formElement.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      const hasLabel = input.labels?.length > 0 || 
                     input.getAttribute('aria-label') || 
                     input.getAttribute('aria-labelledby');
      if (!hasLabel) {
        report.missingLabels.push({
          tag: input.tagName,
          type: input.type,
          id: input.id,
          name: input.name
        });
      }
    });
    
    // Check roles
    const elementsWithRoles = formElement.querySelectorAll('[role]');
    report.hasRoles = Array.from(elementsWithRoles).map(el => ({
      tag: el.tagName,
      role: el.getAttribute('role'),
      id: el.id
    }));
    
    // Check focusable elements
    const focusableSelectors = 'input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])';
    const focusableElements = formElement.querySelectorAll(focusableSelectors);
    report.focusableElements = Array.from(focusableElements).map(el => ({
      tag: el.tagName,
      type: el.type,
      id: el.id,
      tabIndex: el.tabIndex,
      disabled: el.disabled
    }));
    

    
    return report;
  }, [getAccessibilityPreferences]);

  return { 
    announce, 
    focusElement, 
    setupKeyboardNav, 
    manageFocusTrap,
    handleFormError,
    handleFormSuccess,
    registerFormElement,
    getAccessibilityPreferences,
    manageFocusSequence,
    testAccessibility
  };
};

export default useAccessibility;