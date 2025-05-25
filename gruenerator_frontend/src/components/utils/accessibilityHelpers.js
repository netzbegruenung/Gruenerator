// accessibilityHelpers.js

// Funktion zur Ankündigung von Nachrichten für Screenreader
export const announceToScreenReader = (message) => {
    const announcer = document.getElementById('sr-announcer');
    if (announcer) {
      announcer.textContent = message;
    } else {
      console.warn('Screenreader announcer element not found');
    }
  };
  
  // Funktion zum Setzen des Fokus auf ein bestimmtes Element
  export const setFocus = (elementId) => {
    const element = document.getElementById(elementId);
    if (element) {
      element.focus();
    } else {
      console.warn(`Element with id "${elementId}" not found`);
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
      } else {
        console.warn(`Element not found for aria-label: "${label}"`);
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
  
