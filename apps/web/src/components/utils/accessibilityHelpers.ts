/**
 * Accessibility helper utilities for improving keyboard navigation,
 * screen reader support, and ARIA enhancements
 */

/**
 * Element with optional label for ARIA enhancement
 */
interface LabelledElement {
  element: HTMLElement | null;
  label: string;
}

/**
 * Options for enhanced keyboard navigation setup
 */
interface EnhancedKeyboardOptions {
  onEnterSubmit?: boolean;
  onEscapeCancel?: boolean;
  enableTabManagement?: boolean;
}

/**
 * User accessibility preferences
 */
export interface AccessibilityPreferences {
  prefersReducedMotion: boolean;
  prefersHighContrast: boolean;
  prefersDarkMode: boolean;
  forcedColors: boolean;
}

/**
 * Passive screen reader announcements - use existing form-error-announcer
 */
export const announceToScreenReader = (message: string): void => {
  const announcer = document.getElementById('form-error-announcer');
  if (announcer) {
    announcer.textContent = message;
  }
};

/**
 * Set focus on a specific element by ID
 */
export const setFocus = (elementId: string): void => {
  const element = document.getElementById(elementId);
  if (element) {
    element.focus();
  }
};

/**
 * @deprecated Custom tab navigation removed - let browser handle all tab navigation
 */
export const handleKeyboardNavigation = (
  _event: KeyboardEvent,
  _elements: HTMLElement[]
): void => {
  return;
};

/**
 * Create an aria-live region for announcements
 */
export const createAriaLiveRegion = (
  id = 'aria-live-region',
  ariaLive: 'polite' | 'assertive' = 'polite'
): HTMLElement => {
  let region = document.getElementById(id);
  if (!region) {
    region = document.createElement('div');
    region.id = id;
    region.setAttribute('aria-live', ariaLive);
    region.setAttribute('aria-atomic', 'true');
    region.style.position = 'absolute';
    region.style.width = '1px';
    region.style.height = '1px';
    region.style.margin = '-1px';
    region.style.padding = '0';
    region.style.overflow = 'hidden';
    region.style.clip = 'rect(0, 0, 0, 0)';
    region.style.whiteSpace = 'nowrap';
    region.style.border = '0';
    document.body.appendChild(region);
  }
  return region;
};

/**
 * Update an aria-live region with a message
 */
export const updateAriaLiveRegion = (message: string, id = 'aria-live-region'): void => {
  const region = createAriaLiveRegion(id);
  region.textContent = message;
};

/**
 * Passive ARIA labeling - only add labels when no accessible name exists
 */
export const addAriaLabelsToElements = (labelledElements: LabelledElement[]): void => {
  labelledElements.forEach(({ element, label }) => {
    if (element) {
      const hasAccessibleName =
        element.getAttribute('aria-label') ||
        element.getAttribute('aria-labelledby') ||
        (element as HTMLInputElement).labels?.length > 0;

      if (!hasAccessibleName) {
        element.setAttribute('aria-label', label);
      }
    }
  });
};

/**
 * Enhance focus visibility for keyboard users
 */
export const enhanceFocusVisibility = (): void => {
  document.body.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      document.body.classList.add('user-is-tabbing');
    }
  });

  document.body.addEventListener('mousedown', () => {
    document.body.classList.remove('user-is-tabbing');
  });
};

/**
 * Enhanced keyboard navigation with Enter and Escape support
 */
export const setupEnhancedKeyboardNavigation = (
  formElement: HTMLElement | null,
  options: EnhancedKeyboardOptions = {}
): (() => void) | undefined => {
  if (!formElement) return;

  const { onEscapeCancel = true } = options;

  const existingSkipLinks = document.querySelectorAll('.skip-link');
  existingSkipLinks.forEach((link) => link.remove());

  const handleKeyDown = (event: Event): void => {
    const keyEvent = event as KeyboardEvent;

    if (onEscapeCancel && keyEvent.key === 'Escape') {
      const cancelButton = formElement.querySelector<HTMLButtonElement>(
        '[data-action="cancel"], .cancel-button'
      );
      if (cancelButton) {
        cancelButton.click();
      }
    }
  };

  formElement.addEventListener('keydown', handleKeyDown);

  return () => {
    formElement.removeEventListener('keydown', handleKeyDown);
  };
};

/**
 * @deprecated Browser and screen readers handle card navigation natively
 */
export const manageFocusForCardLayouts = (
  _event: KeyboardEvent,
  _container: HTMLElement
): void => {
  return;
};

/**
 * Get all focusable elements in a container
 */
export const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  const focusableSelectors = [
    'input:not([disabled]):not([hidden])',
    'select:not([disabled]):not([hidden])',
    'textarea:not([disabled]):not([hidden])',
    'button:not([disabled]):not([hidden])',
    'a[href]:not([disabled]):not([hidden])',
    '[tabindex]:not([tabindex="-1"]):not([disabled]):not([hidden])'
  ].join(',');

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors)).filter(
    (element) => element.offsetParent !== null
  );
};

/**
 * Find previous card in the form
 */
export const findPreviousCard = (currentCard: Element): Element | null => {
  const allCards = document.querySelectorAll('.form-card, .card-container');
  const currentIndex = Array.from(allCards).indexOf(currentCard);
  return currentIndex > 0 ? allCards[currentIndex - 1] : null;
};

/**
 * Find next card in the form
 */
export const findNextCard = (currentCard: Element): Element | null => {
  const allCards = document.querySelectorAll('.form-card, .card-container');
  const currentIndex = Array.from(allCards).indexOf(currentCard);
  return currentIndex < allCards.length - 1 ? allCards[currentIndex + 1] : null;
};

/**
 * Passive ARIA support - only enhance when not already present
 */
export const enhanceAriaSupport = (formElement: HTMLElement | null): void => {
  if (!formElement) return;

  const cardContainers = formElement.querySelectorAll('.form-card, .card-container');
  cardContainers.forEach((card, index) => {
    if (!card.getAttribute('role')) {
      card.setAttribute('role', 'group');
    }

    if (!card.getAttribute('aria-labelledby')) {
      const title = card.querySelector('h1, h2, h3, h4, h5, h6, .card-title, .form-section-title');
      if (title) {
        if (!title.id) {
          title.id = `card-title-${index}`;
        }
        card.setAttribute('aria-labelledby', title.id);
      }
    }
  });

  if (
    formElement.tagName === 'FORM' &&
    !formElement.getAttribute('role')
  ) {
    if (
      !formElement.getAttribute('aria-label') &&
      !formElement.getAttribute('aria-labelledby')
    ) {
      const formTitle = formElement.querySelector('h1, h2, h3, .form-title');
      if (formTitle) {
        if (!formTitle.id) {
          formTitle.id = `form-title-${Date.now()}`;
        }
        formElement.setAttribute('aria-labelledby', formTitle.id);
      }
    }
  }

  const errorElements = formElement.querySelectorAll('.form-field-error');
  errorElements.forEach((errorEl) => {
    if (!errorEl.getAttribute('role') && !errorEl.getAttribute('aria-live')) {
      errorEl.setAttribute('role', 'alert');
      errorEl.setAttribute('aria-live', 'polite');
    }
  });
};

/**
 * Dynamic error announcement
 */
export const announceFormError = (errorMessage: string, fieldName = ''): void => {
  const message = fieldName
    ? `Fehler in Feld ${fieldName}: ${errorMessage}`
    : `Formularfehler: ${errorMessage}`;

  updateAriaLiveRegion(message, 'form-error-announcer');

  setTimeout(() => {
    updateAriaLiveRegion('', 'form-error-announcer');
  }, 3000);
};

/**
 * Success announcement
 */
export const announceFormSuccess = (message = 'Formular erfolgreich übermittelt'): void => {
  updateAriaLiveRegion(message, 'form-success-announcer');

  setTimeout(() => {
    updateAriaLiveRegion('', 'form-success-announcer');
  }, 3000);
};

/**
 * Color scheme and high contrast detection
 */
export const detectAccessibilityPreferences = (): AccessibilityPreferences => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prefersHighContrast = window.matchMedia('(prefers-contrast: high)').matches;
  const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const forcedColors = window.matchMedia('(forced-colors: active)').matches;

  return {
    prefersReducedMotion,
    prefersHighContrast,
    prefersDarkMode,
    forcedColors
  };
};

/**
 * Apply accessibility preferences to form elements
 */
export const applyAccessibilityPreferences = (
  formElement: HTMLElement
): AccessibilityPreferences => {
  const preferences = detectAccessibilityPreferences();

  if (preferences.prefersReducedMotion) {
    formElement.classList.add('reduce-motion');
  }

  if (preferences.prefersHighContrast) {
    formElement.classList.add('high-contrast');
  }

  if (preferences.forcedColors) {
    formElement.classList.add('forced-colors');
  }

  return preferences;
};
