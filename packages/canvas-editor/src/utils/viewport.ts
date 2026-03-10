/**
 * Viewport utilities for responsive canvas rendering
 */

const MOBILE_BREAKPOINT = 900;
const MOBILE_PADDING = 32;
const DESKTOP_SIDEBAR_WIDTH = 64;
const DESKTOP_PADDING = 48;
const DESKTOP_MAX_CAP = 1400;

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
 * - Desktop: Fill available space (viewport - sidebar - padding), capped at 1400px
 *
 * @returns Optimal maxContainerWidth for CanvasStage
 */
export function getOptimalContainerWidth(): number {
  if (isMobile()) {
    return window.innerWidth - MOBILE_PADDING;
  }
  const availableWidth = window.innerWidth - DESKTOP_SIDEBAR_WIDTH - DESKTOP_PADDING;
  return Math.min(availableWidth, DESKTOP_MAX_CAP);
}
