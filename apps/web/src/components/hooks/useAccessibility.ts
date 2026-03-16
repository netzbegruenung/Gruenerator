// useAccessibility.ts
/* global process */
import { useEffect, useCallback, useRef } from 'react';

import {
  announceToScreenReader,
  setFocus,
  updateAriaLiveRegion,
  setupEnhancedKeyboardNavigation,
  enhanceAriaSupport,
  announceFormError,
  announceFormSuccess,
  detectAccessibilityPreferences,
  applyAccessibilityPreferences,
  createAriaLiveRegion,
} from '../utils/accessibilityHelpers';

interface UseAccessibilityOptions {
  enableEnhancedNavigation?: boolean;
  enableAriaSupport?: boolean;
  enableErrorAnnouncements?: boolean;
  enableSuccessAnnouncements?: boolean;
  keyboardNavigationOptions?: Record<string, unknown>;
}

interface FocusSequenceControls {
  focusNext: () => void;
  focusPrevious: () => void;
  focusCurrent: () => void;
  getCurrentIndex: () => number;
  setCurrentIndex: (index: number) => void;
}

interface AccessibilityReportElement {
  tag: string;
  id: string;
  label?: string | null;
}

interface AccessibilityReportInput {
  tag: string;
  type: string;
  id: string;
  name: string;
}

interface AccessibilityReportRole {
  tag: string;
  role: string | null;
  id: string;
}

interface AccessibilityReportFocusable {
  tag: string;
  type: string;
  id: string;
  tabIndex: number;
  disabled: boolean;
}

interface AccessibilityReport {
  hasAriaLabels: AccessibilityReportElement[];
  missingLabels: AccessibilityReportInput[];
  hasRoles: AccessibilityReportRole[];
  missingRoles: never[];
  focusableElements: AccessibilityReportFocusable[];
  accessibilityPreferences: ReturnType<typeof detectAccessibilityPreferences>;
}

const useAccessibility = (options: UseAccessibilityOptions = {}) => {
  const formRef = useRef<HTMLElement | null>(null);
  const cleanupFunctions = useRef<Array<() => void>>([]);

  const {
    enableEnhancedNavigation = true,
    enableAriaSupport = true,
    enableErrorAnnouncements = true,
    enableSuccessAnnouncements = true,
    keyboardNavigationOptions = {},
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
    applyAccessibilityPreferences(formElement);

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
      cleanupFunctions.current.forEach((cleanup) => {
        if (typeof cleanup === 'function') {
          cleanup();
        }
      });
      cleanupFunctions.current = [];
    };
  }, [enableEnhancedNavigation, enableAriaSupport, keyboardNavigationOptions]);

  const announce = useCallback((message: string): void => {
    announceToScreenReader(message);
    updateAriaLiveRegion(message);
  }, []);

  const focusElement = useCallback((elementId: string): void => {
    setFocus(elementId);
  }, []);

  const manageFocusTrap = useCallback(
    (
      trapActive: boolean,
      containerRef: React.RefObject<HTMLElement | null>,
      _options: Record<string, unknown> = {}
    ): boolean => {
      if (containerRef.current) {
        if (trapActive) {
          // Focus trap is managed by the FocusTrap component in JSX
          // This hook provides configuration and state management
        } else {
          // Focus trap should be inactive
        }
      }
      return trapActive;
    },
    []
  );

  // Enhanced error handling with announcements
  const handleFormError = useCallback(
    (errorMessage: string, fieldName: string = ''): void => {
      if (enableErrorAnnouncements) {
        announceFormError(errorMessage, fieldName);
      }
    },
    [enableErrorAnnouncements]
  );

  // Enhanced success handling with announcements
  const handleFormSuccess = useCallback(
    (message: string): void => {
      if (enableSuccessAnnouncements) {
        announceFormSuccess(message);
      }
    },
    [enableSuccessAnnouncements]
  );

  // Function to register form element
  const registerFormElement = useCallback((element: HTMLElement | null): void => {
    formRef.current = element;
  }, []);

  // Get accessibility preferences
  const getAccessibilityPreferences = useCallback(() => {
    return detectAccessibilityPreferences();
  }, []);

  // Minimal focus management - use sparingly to avoid screen reader conflicts
  const manageFocusSequence = useCallback(
    (elements: HTMLElement[], startIndex: number = 0): FocusSequenceControls | undefined => {
      if (!elements || elements.length === 0) return;

      console.warn(
        'manageFocusSequence: Programmatic focus management can interfere with screen readers - use browser native focus instead'
      );

      let currentIndex = startIndex;

      const focusNext = (): void => {
        // Only move focus if user explicitly requested it, don't auto-focus
        if (currentIndex < elements.length - 1) {
          currentIndex++;
          // Let browser/screen reader handle focus timing
          setTimeout(() => elements[currentIndex]?.focus(), 0);
        }
      };

      const focusPrevious = (): void => {
        if (currentIndex > 0) {
          currentIndex--;
          setTimeout(() => elements[currentIndex]?.focus(), 0);
        }
      };

      const focusCurrent = (): void => {
        setTimeout(() => elements[currentIndex]?.focus(), 0);
      };

      // Don't auto-focus on creation - let screen reader maintain current position

      return {
        focusNext,
        focusPrevious,
        focusCurrent,
        getCurrentIndex: () => currentIndex,
        setCurrentIndex: (index: number) => {
          if (index >= 0 && index < elements.length) {
            currentIndex = index;
            // Don't auto-focus, just update index
          }
        },
      };
    },
    []
  );

  // Accessibility testing helpers (for development)
  const testAccessibility = useCallback((): AccessibilityReport | undefined => {
    if (process.env.NODE_ENV !== 'development') return;

    const formElement = formRef.current;
    if (!formElement) return;

    const report: AccessibilityReport = {
      hasAriaLabels: [],
      missingLabels: [],
      hasRoles: [],
      missingRoles: [],
      focusableElements: [],
      accessibilityPreferences: getAccessibilityPreferences(),
    };

    // Check ARIA labels
    const labeledElements = formElement.querySelectorAll('[aria-label], [aria-labelledby]');
    report.hasAriaLabels = Array.from(labeledElements).map((el) => ({
      tag: el.tagName,
      id: el.id,
      label: el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'),
    }));

    // Check for missing labels on inputs
    const inputs = formElement.querySelectorAll('input, select, textarea');
    inputs.forEach((input) => {
      const inputEl = input as HTMLInputElement;
      const hasLabel =
        inputEl.labels?.length ||
        inputEl.getAttribute('aria-label') ||
        inputEl.getAttribute('aria-labelledby');
      if (!hasLabel) {
        report.missingLabels.push({
          tag: inputEl.tagName,
          type: inputEl.type,
          id: inputEl.id,
          name: inputEl.name,
        });
      }
    });

    // Check roles
    const elementsWithRoles = formElement.querySelectorAll('[role]');
    report.hasRoles = Array.from(elementsWithRoles).map((el) => ({
      tag: el.tagName,
      role: el.getAttribute('role'),
      id: el.id,
    }));

    // Check focusable elements
    const focusableSelectors =
      'input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])';
    const focusableElements = formElement.querySelectorAll(focusableSelectors);
    report.focusableElements = Array.from(focusableElements).map((el) => {
      const htmlEl = el as HTMLInputElement;
      return {
        tag: htmlEl.tagName,
        type: htmlEl.type,
        id: htmlEl.id,
        tabIndex: htmlEl.tabIndex,
        disabled: htmlEl.disabled,
      };
    });

    return report;
  }, [getAccessibilityPreferences]);

  return {
    announce,
    focusElement,
    manageFocusTrap,
    handleFormError,
    handleFormSuccess,
    registerFormElement,
    getAccessibilityPreferences,
    manageFocusSequence,
    testAccessibility,
  };
};

export default useAccessibility;
