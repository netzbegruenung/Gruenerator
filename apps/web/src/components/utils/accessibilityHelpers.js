// accessibilityHelpers.js

// Passive screen reader announcements - use existing form-error-announcer
export const announceToScreenReader = (message) => {
    // Use the consolidated form-error-announcer instead of separate sr-announcer
    const announcer = document.getElementById('form-error-announcer');
    if (announcer) {
      announcer.textContent = message;
    }
  };
  
  // Funktion zum Setzen des Fokus auf ein bestimmtes Element
  export const setFocus = (elementId) => {
    const element = document.getElementById(elementId);
    if (element) {
      element.focus();
    }
  };
  
  // DEPRECATED: Custom tab navigation removed - let browser handle all tab navigation
  export const handleKeyboardNavigation = (event, elements) => {
    // This function is now passive - browser handles all tab navigation natively
    // Keeping function for backward compatibility but removing all custom behavior
    return;
  };
  
  // Funktion zum Erstellen eines aria-live Bereichs
  export const createAriaLiveRegion = (id = 'aria-live-region', ariaLive = 'polite') => {
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
  
  // Funktion zum Aktualisieren des aria-live Bereichs
  export const updateAriaLiveRegion = (message, id = 'aria-live-region') => {
    const region = createAriaLiveRegion(id);
    region.textContent = message;
  };
  
  // Passive ARIA labeling - only add labels when no accessible name exists
  export const addAriaLabelsToElements = (labelledElements) => {
    labelledElements.forEach(({ element, label }) => {
      if (element) {
        // Only add aria-label if no accessible name already exists
        const hasAccessibleName = element.getAttribute('aria-label') || 
                                 element.getAttribute('aria-labelledby') ||
                                 element.labels?.length > 0;
        
        if (!hasAccessibleName) {
          element.setAttribute('aria-label', label);
        }
      }
    });
  };
  
  // Funktion zur Verbesserung der Fokus-Sichtbarkeit
  export const enhanceFocusVisibility = () => {
    document.body.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        document.body.classList.add('user-is-tabbing');
      }
    });
  
    document.body.addEventListener('mousedown', () => {
      document.body.classList.remove('user-is-tabbing');
    });
  };

// ===== Phase 5: Neue Accessibility-Funktionen =====

// Enhanced keyboard navigation with Enter and Escape support
export const setupEnhancedKeyboardNavigation = (formElement, options = {}) => {
  if (!formElement) return;

  const {
    onEnterSubmit = true,
    onEscapeCancel = true,
    enableTabManagement = true
  } = options;

  // Remove any existing custom skip links - let browser handle native navigation
  const existingSkipLinks = document.querySelectorAll('.skip-link');
  existingSkipLinks.forEach(link => link.remove());

  const handleKeyDown = (event) => {
    // REMOVED: Enter key override - let browser handle form submission natively
    // This was interfering with screen reader form navigation expectations

    // Escape key for cancel actions - keeping this as it's non-interfering enhancement
    if (onEscapeCancel && event.key === 'Escape') {
      const cancelButton = formElement.querySelector('[data-action="cancel"], .cancel-button');
      if (cancelButton) {
        cancelButton.click();
      }
    }

    // REMOVED: Tab management - let browser handle all tab navigation natively
  };

  formElement.addEventListener('keydown', handleKeyDown);
  
  return () => {
    formElement.removeEventListener('keydown', handleKeyDown);
  };
};

// DEPRECATED: Skip link creation removed - browsers handle this natively
// export const createSkipLink = () => {
//   // Function deprecated - rely on browser native skip navigation
//   return null;
// };

// DEPRECATED: Enhanced tab management removed - let browser handle card navigation
export const manageFocusForCardLayouts = (event, container) => {
  // Function disabled - browser and screen readers handle card navigation natively
  // Keeping function for backward compatibility but removing all custom behavior
  return;
};

// Get all focusable elements in a container
export const getFocusableElements = (container) => {
  const focusableSelectors = [
    'input:not([disabled]):not([hidden])',
    'select:not([disabled]):not([hidden])',
    'textarea:not([disabled]):not([hidden])',
    'button:not([disabled]):not([hidden])',
    'a[href]:not([disabled]):not([hidden])',
    '[tabindex]:not([tabindex="-1"]):not([disabled]):not([hidden])'
  ].join(',');
  
  return Array.from(container.querySelectorAll(focusableSelectors))
    .filter(element => element.offsetParent !== null); // Filter out hidden elements
};

// Find previous card in the form
export const findPreviousCard = (currentCard) => {
  const allCards = document.querySelectorAll('.form-card, .card-container');
  const currentIndex = Array.from(allCards).indexOf(currentCard);
  return currentIndex > 0 ? allCards[currentIndex - 1] : null;
};

// Find next card in the form
export const findNextCard = (currentCard) => {
  const allCards = document.querySelectorAll('.form-card, .card-container');
  const currentIndex = Array.from(allCards).indexOf(currentCard);
  return currentIndex < allCards.length - 1 ? allCards[currentIndex + 1] : null;
};

// Passive ARIA support - only enhance when not already present
export const enhanceAriaSupport = (formElement) => {
  if (!formElement) return;

  // Only add role attributes for card containers if not already present
  const cardContainers = formElement.querySelectorAll('.form-card, .card-container');
  cardContainers.forEach((card, index) => {
    // Only add role if not already present
    if (!card.getAttribute('role')) {
      card.setAttribute('role', 'group');
    }
    
    // Only add aria-labelledby if not already present and title exists
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

  // Only add form landmark if it's actually a form and doesn't have role
  if (formElement.tagName === 'FORM' && !formElement.getAttribute('role')) {
    // Don't add role="form" - browsers handle <form> elements natively
    // Only add aria-label if no accessible name exists
    if (!formElement.getAttribute('aria-label') && !formElement.getAttribute('aria-labelledby')) {
      const formTitle = formElement.querySelector('h1, h2, h3, .form-title');
      if (formTitle) {
        if (!formTitle.id) {
          formTitle.id = `form-title-${Date.now()}`;
        }
        formElement.setAttribute('aria-labelledby', formTitle.id);
      }
      // Remove automatic aria-label fallback - let browser handle unlabeled forms
    }
  }

  // Only enhance error messages if not already accessible
  const errorElements = formElement.querySelectorAll('.form-field-error');
  errorElements.forEach(errorEl => {
    if (!errorEl.getAttribute('role') && !errorEl.getAttribute('aria-live')) {
      errorEl.setAttribute('role', 'alert');
      errorEl.setAttribute('aria-live', 'polite');
    }
  });
};

// Dynamic error announcement
export const announceFormError = (errorMessage, fieldName = '') => {
  const message = fieldName 
    ? `Fehler in Feld ${fieldName}: ${errorMessage}`
    : `Formularfehler: ${errorMessage}`;
  
  updateAriaLiveRegion(message, 'form-error-announcer');
  
  // Also create a temporary visual focus indicator for screen readers
  setTimeout(() => {
    updateAriaLiveRegion('', 'form-error-announcer');
  }, 3000);
};

// Success announcement
export const announceFormSuccess = (message = 'Formular erfolgreich übermittelt') => {
  updateAriaLiveRegion(message, 'form-success-announcer');
  
  setTimeout(() => {
    updateAriaLiveRegion('', 'form-success-announcer');
  }, 3000);
};

// Color scheme and high contrast detection
export const detectAccessibilityPreferences = () => {
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

// Apply accessibility preferences to form elements
export const applyAccessibilityPreferences = (formElement) => {
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

