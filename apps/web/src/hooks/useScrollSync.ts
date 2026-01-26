import { useCallback, useRef, useEffect } from 'react';

import { announceToScreenReader } from '../utils/focusManagement';

const LOCATION_KEYWORDS = {
  beginning: ['anfang', 'beginning', 'start', 'erste', 'first', 'oben', 'top'],
  end: ['ende', 'end', 'schluss', 'letzte', 'last', 'unten', 'bottom'],
  title: ['titel', 'title', 'überschrift', 'heading', 'header'],
  paragraph: ['absatz', 'paragraph', 'abschnitt', 'section'],
  middle: ['mitte', 'middle', 'zentrum', 'center'],
};

interface ScrollSyncOptions {
  highlightDuration?: number;
  scrollBehavior?: ScrollBehavior;
  topOffset?: number;
  announceChanges?: boolean;
}

const useScrollSync = (
  textContainerRef: React.RefObject<HTMLElement | null>,
  options: ScrollSyncOptions = {}
) => {
  const {
    highlightDuration = 600,
    scrollBehavior = 'smooth',
    topOffset = 80,
    announceChanges = true,
  } = options;

  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHighlightedRef = useRef<Element | null>(null);

  const detectLocationFromText = useCallback((instruction: string | null | undefined) => {
    if (!instruction) return null;

    const lowerInstruction = instruction.toLowerCase();

    for (const [location, keywords] of Object.entries(LOCATION_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerInstruction.includes(keyword)) {
          return location;
        }
      }
    }

    const paragraphMatch = lowerInstruction.match(/(\d+)\.\s*(absatz|paragraph|abschnitt)/);
    if (paragraphMatch) {
      return { type: 'paragraph', index: parseInt(paragraphMatch[1], 10) - 1 };
    }

    return null;
  }, []);

  const findTargetElement = useCallback(
    (location: string | { type: string; index: number } | null) => {
      const container = textContainerRef?.current;
      if (!container) return null;

      const paragraphs = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');

      if (typeof location === 'object' && location !== null && location.type === 'paragraph') {
        return paragraphs[location.index] || null;
      }

      switch (location) {
        case 'beginning':
          return paragraphs[0] || container.firstElementChild;
        case 'end':
          return paragraphs[paragraphs.length - 1] || container.lastElementChild;
        case 'title':
          return container.querySelector('h1, h2, h3') || paragraphs[0];
        case 'middle':
          return paragraphs[Math.floor(paragraphs.length / 2)] || null;
        default:
          return null;
      }
    },
    [textContainerRef]
  );

  const scrollToElement = useCallback(
    (element: Element | null, highlight = true) => {
      if (!element) return false;

      const elementHeight = (element as HTMLElement).offsetHeight;
      const viewportHeight = window.innerHeight;

      if (elementHeight < viewportHeight * 0.8) {
        element.scrollIntoView({
          behavior: scrollBehavior,
          block: 'center',
        });
      } else {
        const elementTop = element.getBoundingClientRect().top + window.scrollY;
        const scrollPosition = Math.max(0, elementTop - topOffset);

        window.scrollTo({
          top: scrollPosition,
          behavior: scrollBehavior,
        });
      }

      if (highlight) {
        highlightElement(element);
      }

      return true;
    },
    [scrollBehavior, topOffset]
  );

  const highlightElement = useCallback(
    (element: Element | null) => {
      if (!element) return;

      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        if (lastHighlightedRef.current) {
          lastHighlightedRef.current.classList.remove('scroll-sync-highlight');
        }
      }

      element.classList.add('scroll-sync-highlight');
      lastHighlightedRef.current = element;

      highlightTimeoutRef.current = setTimeout(() => {
        element.classList.remove('scroll-sync-highlight');
        lastHighlightedRef.current = null;
      }, highlightDuration);
    },
    [highlightDuration]
  );

  const syncToInstruction = useCallback(
    (instruction: string | null | undefined) => {
      const location = detectLocationFromText(instruction);
      if (!location) return false;

      const targetElement = findTargetElement(location);
      if (!targetElement) return false;

      const success = scrollToElement(targetElement, true);

      if (success && announceChanges) {
        const locationName =
          typeof location === 'object' ? `Absatz ${location.index + 1}` : location;
        announceToScreenReader(`Scrolle zu ${locationName}`, 'polite');
      }

      return success;
    },
    [detectLocationFromText, findTargetElement, scrollToElement, announceChanges]
  );

  const highlightChangedArea = useCallback(
    (beforeText: string | null | undefined, afterText: string | null | undefined) => {
      const container = textContainerRef?.current;
      if (!container || !beforeText || !afterText) return;

      const paragraphs = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');

      for (const paragraph of paragraphs) {
        const paragraphText = paragraph.textContent || '';

        if (!beforeText.includes(paragraphText) && afterText.includes(paragraphText)) {
          scrollToElement(paragraph, true);

          if (announceChanges) {
            announceToScreenReader('Text wurde geändert', 'polite');
          }
          break;
        }
      }
    },
    [textContainerRef, scrollToElement, announceChanges]
  );

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
      if (lastHighlightedRef.current) {
        lastHighlightedRef.current.classList.remove('scroll-sync-highlight');
      }
    };
  }, []);

  return {
    syncToInstruction,
    highlightChangedArea,
    highlightElement,
    scrollToElement,
    detectLocationFromText,
  };
};

export default useScrollSync;
