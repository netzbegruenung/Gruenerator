/**
 * Responsive scaling utilities for React Native
 * Scales sizes based on screen dimensions for consistent UI across devices
 */

import { Dimensions, PixelRatio } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Base dimensions (iPhone 14 Pro)
const BASE_WIDTH = 393;
const BASE_HEIGHT = 852;

/**
 * Scale based on screen width (horizontal scaling)
 * Use for: horizontal padding, widths, horizontal margins
 */
export const scale = (size: number): number => {
  return Math.round((SCREEN_WIDTH / BASE_WIDTH) * size);
};

/**
 * Scale based on screen height (vertical scaling)
 * Use for: vertical padding, heights, vertical margins
 */
export const verticalScale = (size: number): number => {
  return Math.round((SCREEN_HEIGHT / BASE_HEIGHT) * size);
};

/**
 * Moderate scale - less aggressive scaling
 * Use for: font sizes, icon sizes, border radius
 * @param factor - 0 = no scaling, 1 = full scaling (default 0.5)
 */
export const moderateScale = (size: number, factor: number = 0.5): number => {
  return Math.round(size + (scale(size) - size) * factor);
};

/**
 * Font scale that respects user's accessibility settings
 */
export const fontScale = (size: number): number => {
  return Math.round(PixelRatio.getFontScale() * moderateScale(size, 0.3));
};

/**
 * Responsive spacing values (scaled from base spacing)
 */
export const responsiveSpacing = {
  xxsmall: scale(4),
  xsmall: scale(8),
  small: scale(12),
  medium: scale(16),
  large: scale(24),
  xlarge: scale(32),
  xxlarge: scale(48),
} as const;

/**
 * Check if device is a tablet
 */
export const isTablet = SCREEN_WIDTH >= 768;

/**
 * Get a size that's larger on tablets
 */
export const tabletScale = (phoneSize: number, tabletSize: number): number => {
  return isTablet ? tabletSize : phoneSize;
};
