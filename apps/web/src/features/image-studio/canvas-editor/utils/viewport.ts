/**
 * Viewport utilities for responsive canvas rendering
 */

const MOBILE_BREAKPOINT = 900; // px - matches CanvasEditorLayout mobile breakpoint
const DESKTOP_MAX_WIDTH = 900; // px
const MOBILE_PADDING = 32; // px - minimal padding for mobile

/**
 * Detect if current viewport is mobile size
 * @returns true if viewport width is below 900px
 */
export function isMobile(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;
}

/**
 * Get optimal container width based on viewport size
 * - Mobile: Fill screen width with minimal padding
 * - Desktop: Use standard max width (900px)
 *
 * @returns Optimal maxContainerWidth for CanvasStage
 */
export function getOptimalContainerWidth(): number {
  if (isMobile()) {
    // Fill screen width with minimal padding on mobile
    return window.innerWidth - MOBILE_PADDING;
  }
  // Desktop: use standard max width
  return DESKTOP_MAX_WIDTH;
}
