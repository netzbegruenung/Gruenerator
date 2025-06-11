// accessibilityHelpers.js

// Funktion zur Ankündigung von Nachrichten für Screenreader
export const announceToScreenReader = (message) => {
    const announcer = document.getElementById('sr-announcer');
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
  
  // Funktion zur Verbesserung der Tastaturnavigation
  export const handleKeyboardNavigation = (event, elements) => {
    if (event.key === 'Tab') {
      const currentIndex = elements.indexOf(document.activeElement);
      const nextIndex = event.shiftKey 
        ? (currentIndex - 1 + elements.length) % elements.length 
        : (currentIndex + 1) % elements.length;
      elements[nextIndex].focus();
      event.preventDefault();
    }
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
  
  // Funktion zum Hinzufügen von aria-labels zu Elementen
  export const addAriaLabelsToElements = (labelledElements) => {
    labelledElements.forEach(({ element, label }) => {
      if (element) {
        element.setAttribute('aria-label', label);
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
    skipLinkText = 'Zum Hauptinhalt springen',
    enableTabManagement = true
  } = options;

  // Add skip link for complex forms
  const skipLink = createSkipLink(skipLinkText);
  if (skipLink && !document.querySelector('.skip-link')) {
    document.body.insertBefore(skipLink, document.body.firstChild);
  }

  const handleKeyDown = (event) => {
    // Enter key for form submission
    if (onEnterSubmit && event.key === 'Enter' && !event.shiftKey) {
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'SELECT' ||
        (activeElement.tagName === 'TEXTAREA' && !event.shiftKey)
      )) {
        const form = activeElement.closest('form');
        if (form) {
          const submitButton = form.querySelector('[type="submit"]');
          if (submitButton && !submitButton.disabled) {
            event.preventDefault();
            submitButton.click();
          }
        }
      }
    }

    // Escape key for cancel actions
    if (onEscapeCancel && event.key === 'Escape') {
      const cancelButton = formElement.querySelector('[data-action="cancel"], .cancel-button');
      if (cancelButton) {
        cancelButton.click();
      }
    }

    // Enhanced tab management for card layouts
    if (enableTabManagement && event.key === 'Tab') {
      manageFocusForCardLayouts(event, formElement);
    }
  };

  formElement.addEventListener('keydown', handleKeyDown);
  
  return () => {
    formElement.removeEventListener('keydown', handleKeyDown);
  };
};

// Create skip link for better navigation
export const createSkipLink = (text = 'Zum Hauptinhalt springen') => {
  const skipLink = document.createElement('a');
  skipLink.href = '#main-content';
  skipLink.className = 'skip-link';
  skipLink.textContent = text;
  skipLink.style.cssText = `
    position: absolute;
    top: -40px;
    left: 6px;
    background: var(--interactive-accent-color);
    color: white;
    padding: 8px;
    border-radius: 4px;
    text-decoration: none;
    font-weight: bold;
    z-index: 9999;
    transition: top 0.3s;
  `;
  
  skipLink.addEventListener('focus', () => {
    skipLink.style.top = '6px';
  });
  
  skipLink.addEventListener('blur', () => {
    skipLink.style.top = '-40px';
  });
  
  return skipLink;
};

// Enhanced tab management for card layouts
export const manageFocusForCardLayouts = (event, container) => {
  const focusableElements = getFocusableElements(container);
  const currentIndex = focusableElements.indexOf(document.activeElement);
  
  // Check if we're in a card container
  const currentCard = document.activeElement?.closest('.form-card, .card-container');
  if (currentCard) {
    const cardFocusables = getFocusableElements(currentCard);
    const cardIndex = cardFocusables.indexOf(document.activeElement);
    
    if (event.shiftKey && cardIndex === 0) {
      // Moving to previous card or form section
      const previousCard = findPreviousCard(currentCard);
      if (previousCard) {
        event.preventDefault();
        const previousCardFocusables = getFocusableElements(previousCard);
        const lastElement = previousCardFocusables[previousCardFocusables.length - 1];
        if (lastElement) lastElement.focus();
      }
    } else if (!event.shiftKey && cardIndex === cardFocusables.length - 1) {
      // Moving to next card or form section
      const nextCard = findNextCard(currentCard);
      if (nextCard) {
        event.preventDefault();
        const nextCardFocusables = getFocusableElements(nextCard);
        const firstElement = nextCardFocusables[0];
        if (firstElement) firstElement.focus();
      }
    }
  }
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

// Enhanced ARIA support for form elements
export const enhanceAriaSupport = (formElement) => {
  if (!formElement) return;

  // Add role attributes for card containers
  const cardContainers = formElement.querySelectorAll('.form-card, .card-container');
  cardContainers.forEach((card, index) => {
    card.setAttribute('role', 'group');
    card.setAttribute('aria-labelledby', `card-title-${index}`);
    
    // Find or create card title
    const title = card.querySelector('h1, h2, h3, h4, h5, h6, .card-title, .form-section-title');
    if (title) {
      title.id = `card-title-${index}`;
    }
  });

  // Add form landmark
  if (formElement.tagName === 'FORM') {
    formElement.setAttribute('role', 'form');
    if (!formElement.getAttribute('aria-label') && !formElement.getAttribute('aria-labelledby')) {
      const formTitle = formElement.querySelector('h1, h2, h3, .form-title');
      if (formTitle) {
        if (!formTitle.id) {
          formTitle.id = `form-title-${Date.now()}`;
        }
        formElement.setAttribute('aria-labelledby', formTitle.id);
      } else {
        formElement.setAttribute('aria-label', 'Formular');
      }
    }
  }

  // Enhanced error message announcements
  const errorElements = formElement.querySelectorAll('.form-field-error');
  errorElements.forEach(errorEl => {
    if (!errorEl.getAttribute('role')) {
      errorEl.setAttribute('role', 'alert');
    }
    if (!errorEl.getAttribute('aria-live')) {
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

