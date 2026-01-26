/**
 * Focus Management Utilities
 *
 * Provides utilities for managing focus in complex UI patterns like modals,
 * inline editors, and dynamic content areas.
 */

// Focus trap options
interface FocusTrapOptions {
  initialFocus?: HTMLElement | (() => HTMLElement | null) | null;
  returnFocus?: boolean;
  escapeDeactivates?: boolean;
  clickOutsideDeactivates?: boolean;
  onDeactivate?: () => void;
}

// Inline editor focus options
interface InlineEditorFocusOptions {
  onEnter?: (event: KeyboardEvent) => void;
  onEscape?: (event: KeyboardEvent) => void;
  onTab?: (event: KeyboardEvent) => void;
  selectAllOnFocus?: boolean;
}

// Inline editor focus return type
interface InlineEditorFocusReturn {
  handleFocus: (event: FocusEvent) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  props: {
    onFocus: (event: FocusEvent) => void;
    onKeyDown: (event: KeyboardEvent) => void;
  };
}

// Preserve focus options
interface PreserveFocusOptions {
  focusSelector?: string | null;
  fallbackSelector?: string | null;
}

// Skip link return type
interface SkipLinkProps {
  href: string;
  className: string;
  onClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  children: string;
}

// Focus scope return type
interface FocusScopeReturn {
  enter: () => void;
  exit: () => void;
}

/**
 * Focus trap utility for modals and overlays
 * @param container - Container element to trap focus within
 * @param options - Configuration options
 * @returns Cleanup function to remove event listeners
 */
export const createFocusTrap = (
  container: HTMLElement,
  options: FocusTrapOptions = {}
): (() => void) => {
  const {
    initialFocus = null,
    returnFocus = true,
    escapeDeactivates = true,
    clickOutsideDeactivates = false,
    onDeactivate = () => {},
  } = options;

  const previousActiveElement = document.activeElement as HTMLElement | null;
  const focusableSelectors = [
    'a[href]:not([disabled])',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input[type="text"]:not([disabled])',
    'input[type="radio"]:not([disabled])',
    'input[type="checkbox"]:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  // Get all focusable elements
  const getFocusableElements = (): HTMLElement[] => {
    return Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors)).filter(
      (el) => el.offsetParent !== null
    ); // Filter out hidden elements
  };

  // Focus initial element
  const focusInitialElement = (): void => {
    if (initialFocus && typeof initialFocus === 'function') {
      const element = initialFocus();
      if (element) element.focus();
    } else if (initialFocus && initialFocus instanceof HTMLElement) {
      initialFocus.focus();
    } else {
      const focusableElements = getFocusableElements();
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }
  };

  // Handle tab key
  const handleTab = (event: KeyboardEvent): void => {
    const focusableElements = getFocusableElements();
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  // Handle keyboard events
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Tab') {
      handleTab(event);
    } else if (event.key === 'Escape' && escapeDeactivates) {
      event.preventDefault();
      deactivate();
    }
  };

  // Handle click outside
  const handleClickOutside = (event: MouseEvent): void => {
    if (clickOutsideDeactivates && !container.contains(event.target as Node)) {
      deactivate();
    }
  };

  // Deactivate focus trap
  const deactivate = (): void => {
    document.removeEventListener('keydown', handleKeyDown);
    if (clickOutsideDeactivates) {
      document.removeEventListener('click', handleClickOutside);
    }

    if (returnFocus && previousActiveElement && document.body.contains(previousActiveElement)) {
      previousActiveElement.focus();
    }

    onDeactivate();
  };

  // Activate focus trap
  setTimeout(() => {
    focusInitialElement();
    document.addEventListener('keydown', handleKeyDown);
    if (clickOutsideDeactivates) {
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 0);
    }
  }, 0);

  return deactivate;
};

/**
 * Inline editor focus management
 * @param options - Configuration options
 * @returns Focus management functions
 */
export const createInlineEditorFocus = (
  options: InlineEditorFocusOptions = {}
): InlineEditorFocusReturn => {
  const {
    onEnter = () => {},
    onEscape = () => {},
    onTab = () => {},
    selectAllOnFocus = true,
  } = options;

  const handleFocus = (event: FocusEvent): void => {
    const target = event.target as HTMLInputElement;
    if (selectAllOnFocus && target.select) {
      target.select();
    }
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    switch (event.key) {
      case 'Enter':
        if (!event.shiftKey) {
          event.preventDefault();
          onEnter(event);
        }
        break;

      case 'Escape':
        event.preventDefault();
        onEscape(event);
        break;

      case 'Tab':
        // Let tab work normally, but notify
        onTab(event);
        break;

      default:
        break;
    }
  };

  return {
    handleFocus,
    handleKeyDown,
    props: {
      onFocus: handleFocus,
      onKeyDown: handleKeyDown,
    },
  };
};

/**
 * Restore focus after content update
 * @param updateFn - Function that updates content
 * @param options - Configuration options
 */
export const preserveFocus = async (
  updateFn: () => void | Promise<void>,
  options: PreserveFocusOptions = {}
): Promise<void> => {
  const { focusSelector = null, fallbackSelector = null } = options;

  // Store current focus
  const activeElement = document.activeElement as HTMLElement | null;
  const activeId = activeElement?.id;
  const activeClass = activeElement?.className;
  const activeTag = activeElement?.tagName;

  // Perform update
  await updateFn();

  // Try to restore focus
  requestAnimationFrame(() => {
    let elementToFocus: HTMLElement | null = null;

    // Try custom selector first
    if (focusSelector) {
      elementToFocus = document.querySelector<HTMLElement>(focusSelector);
    }

    // Try to find the same element
    if (!elementToFocus && activeId) {
      elementToFocus = document.getElementById(activeId);
    }

    // Try by class and tag
    if (!elementToFocus && activeClass && activeTag) {
      const candidates = document.querySelectorAll<HTMLElement>(
        `${activeTag}.${activeClass.split(' ').join('.')}`
      );
      if (candidates.length === 1) {
        elementToFocus = candidates[0];
      }
    }

    // Try fallback selector
    if (!elementToFocus && fallbackSelector) {
      elementToFocus = document.querySelector<HTMLElement>(fallbackSelector);
    }

    // Focus the element if found and focusable
    if (elementToFocus && elementToFocus.tabIndex !== -1) {
      elementToFocus.focus();
    }
  });
};

/**
 * Announce content changes to screen readers
 * @param message - Message to announce
 * @param priority - 'polite' or 'assertive'
 */
export const announceToScreenReader = (
  message: string,
  priority: 'polite' | 'assertive' = 'polite'
): void => {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.style.position = 'absolute';
  announcement.style.left = '-10000px';
  announcement.style.width = '1px';
  announcement.style.height = '1px';
  announcement.style.overflow = 'hidden';

  document.body.appendChild(announcement);
  announcement.textContent = message;

  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
};

/**
 * Skip link generator
 * @param targetId - ID of element to skip to
 * @param text - Link text
 * @returns Skip link properties
 */
export const createSkipLink = (
  targetId: string,
  text: string = 'Skip to content'
): SkipLinkProps => {
  return {
    href: `#${targetId}`,
    className: 'skip-link',
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      const target = document.getElementById(targetId);
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.focus();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Remove tabindex after focus
        target.addEventListener(
          'blur',
          () => {
            target.removeAttribute('tabindex');
          },
          { once: true }
        );
      }
    },
    children: text,
  };
};

/**
 * Focus scope manager for nested focus contexts
 * @param scopeElement - Element defining the focus scope
 * @returns Focus scope management functions
 */
export const createFocusScope = (scopeElement: HTMLElement): FocusScopeReturn => {
  let savedFocus: Element | null = null;

  const enter = (): void => {
    savedFocus = document.activeElement;
    const firstFocusable = scopeElement.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (firstFocusable) {
      firstFocusable.focus();
    }
  };

  const exit = (): void => {
    if (savedFocus && savedFocus instanceof HTMLElement && document.body.contains(savedFocus)) {
      savedFocus.focus();
    }
  };

  return { enter, exit };
};

export default {
  createFocusTrap,
  createInlineEditorFocus,
  preserveFocus,
  announceToScreenReader,
  createSkipLink,
  createFocusScope,
};
