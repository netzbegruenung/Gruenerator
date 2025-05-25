// useAccessibility.js
import { useEffect, useCallback, useRef } from 'react';
import FocusTrap from 'focus-trap-react';
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

  const manageFocusTrap = useCallback((trapActive, containerRef, options = {}) => {
    if (containerRef.current) {
      if (trapActive) {
        // FocusTrap wird hier als Komponente gerendert, die das Kind umschließt.
        // Wir müssen den Hook anders strukturieren, um das zu ermöglichen,
        // oder eine imperative API von focus-trap verwenden, falls vorhanden.
        // Für den Moment gehe ich davon aus, dass wir die Komponente dort einsetzen, wo sie gebraucht wird.
        // Dieser Hook könnte eher Konfigurationsoptionen zurückgeben oder Helfer bereitstellen.
        // Alternative: focus-trap direkt in der Komponente verwenden.
        // Für diesen Schritt passe ich den Hook an, um anzuzeigen, wie es gedacht sein könnte,
        // aber die direkte Implementierung von <FocusTrap> wird in BaseForm erfolgen.
        // console.log('[useAccessibility] Focus trap activated for container:', containerRef.current);
      } else {
        // console.log('[useAccessibility] Focus trap deactivated for container:', containerRef.current);
      }
    }
    // Da FocusTrap eine Komponente ist, wird die Logik zur Aktivierung/Deaktivierung
    // direkt in der JSX-Struktur der Komponente liegen, die den Trap verwendet.
    // Dieser Hook könnte eher dazu dienen, zu entscheiden, *ob* ein Trap aktiv sein soll.
    return trapActive; // Gibt zurück, ob der Trap aktiv sein soll.
  }, []);

  return { announce, focusElement, setupKeyboardNav, manageFocusTrap };
};

export default useAccessibility;