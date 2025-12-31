import { useEffect, useRef } from 'react';

/**
 * Hook for automatic scrolling to content on mobile devices
 * Implements smart scroll positioning to prevent over-scrolling
 *
 * @param {React.RefObject} contentRef - Ref to the content element to scroll to
 * @param {boolean} shouldScroll - Trigger condition (e.g., hasContent)
 * @param {Object} options - Configuration options
 * @param {boolean} options.mobileOnly - Only scroll on mobile devices (default: true)
 * @param {number} options.mobileBreakpoint - Mobile breakpoint in pixels (default: 768)
 * @param {number} options.delay - Delay before scrolling in ms (default: 100)
 * @param {number} options.topOffset - Top padding when scrolling tall content (default: 80)
 * @param {number} options.centerThreshold - Content height threshold for centering (default: 0.8)
 * @returns {void}
 */
const useAutoScrollToContent = (
  contentRef,
  shouldScroll,
  options = {}
) => {
  const {
    mobileOnly = true,
    mobileBreakpoint = 768,
    delay = 100,
    topOffset = 80,
    centerThreshold = 0.8
  } = options;

  const prevShouldScrollRef = useRef(shouldScroll);

  useEffect(() => {
    // Check if we're on mobile (if mobileOnly is true)
    const isMobileDevice = !mobileOnly || window.innerWidth <= mobileBreakpoint;

    // Only scroll if:
    // 1. On mobile device (or mobileOnly is false)
    // 2. shouldScroll just changed from false to true
    // 3. Content ref exists
    if (
      isMobileDevice &&
      !prevShouldScrollRef.current &&
      shouldScroll &&
      contentRef.current
    ) {
      // Small delay to ensure content is fully rendered
      setTimeout(() => {
        const element = contentRef.current;
        if (!element) return;

        // Get element and viewport dimensions
        const elementHeight = element.offsetHeight;
        const viewportHeight = window.innerHeight;

        // Smart scroll logic based on content height
        if (elementHeight < viewportHeight * centerThreshold) {
          // Short content: center it to avoid showing footer
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        } else {
          // Tall content: scroll with top padding for comfortable reading
          const elementTop = element.getBoundingClientRect().top + window.scrollY;
          const scrollPosition = Math.max(0, elementTop - topOffset);

          window.scrollTo({
            top: scrollPosition,
            behavior: 'smooth'
          });
        }
      }, delay);
    }

    // Update previous state
    prevShouldScrollRef.current = shouldScroll;
  }, [shouldScroll, contentRef, mobileOnly, mobileBreakpoint, delay, topOffset, centerThreshold]);
};

export default useAutoScrollToContent;
