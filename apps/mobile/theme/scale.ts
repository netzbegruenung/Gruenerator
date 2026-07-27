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
 * The short edge, i.e. the handset's width however it is held.
 *
 * `typeScale` reads this rather than `SCREEN_WIDTH` so that rotating a phone
 * does not resize its text. Type belongs to the device, not to the orientation
 * — and since these are module constants, a value that changed on rotation
 * would be read once at import and then be wrong for the rest of the session.
 */
const SHORT_EDGE = Math.min(SCREEN_WIDTH, SCREEN_HEIGHT);

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
 * The type ramp's own scale — what `typography` and `chatType` are measured in.
 *
 * Every size in those two tables used to be a literal, tuned on one handset
 * (the S24, 384dp). On a narrow phone that ramp is cramped and on a wide one it
 * wastes the width it was given, and nothing in the code said which device it
 * had been fitted to.
 *
 * Three decisions worth keeping:
 *
 * - **Moderate, not proportional.** Half the width ratio. A tablet is wider but
 *   it is not read from further away; at the full ratio body copy on an 800dp
 *   screen lands at 26pt, which is a poster rather than a paragraph.
 * - **Clamped.** Roughly ±6%, so a 360dp phone stops feeling tight and a large
 *   one gains a little air — but never enough to change a layout's line count.
 *   Without the clamp a tablet leaves the range the ramp was designed in.
 * - **No `PixelRatio.getFontScale()`.** `<Text>` already applies the platform's
 *   text-size setting at render time. Folding it in here would apply the
 *   person's accessibility choice twice — which is why `fontScale` above stayed
 *   unused, and why this is a separate function rather than a fix to it.
 *
 * Rounded to half points: below that Android's layout rounding eats the
 * difference, and whole points would collapse neighbouring tiers into each other.
 */
const TYPE_SCALE_MIN = 0.94;
const TYPE_SCALE_MAX = 1.06;

const TYPE_SCALE_FACTOR = Math.min(
  TYPE_SCALE_MAX,
  Math.max(TYPE_SCALE_MIN, 1 + (SHORT_EDGE / BASE_WIDTH - 1) * 0.5)
);

export const typeScale = (size: number): number => Math.round(size * TYPE_SCALE_FACTOR * 2) / 2;

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
