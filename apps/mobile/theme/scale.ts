/**
 * Device scaling: one factor, clamped, read from the short edge.
 *
 * There used to be four functions here (`scale`, `verticalScale`,
 * `moderateScale`, `fontScale`) plus a `responsiveSpacing` table and an
 * `isTablet` flag. Three of them scaled in full proportion to the window, which
 * is defensible between a 360dp and a 430dp handset and falls apart above that:
 * on a 1024dp iPad `moderateScale(48)` came out at 87 and `verticalScale(28)`
 * at 45, so the editor toolbars and the subtitle editor — their only callers —
 * drew half again too large.
 *
 * Two further problems were structural rather than numeric. `Dimensions.get`
 * runs once at import, so a function reading the *live* window is frozen at
 * whatever orientation the app booted in — and iPads rotate today
 * (`UISupportedInterfaceOrientations~ipad` in app.json), as do Android tablets
 * from Android 16 on. And `isTablet` here (threshold 768, non-reactive)
 * competed with `useIsTablet` (700, reactive), leaving two answers to one
 * question.
 *
 * So: what is left reads the SHORT edge, which does not change on rotation, and
 * both functions share one clamped factor. Anything that has to react to the
 * live window belongs in `useLayout`, not here.
 */

import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/** Base dimension (iPhone 14 Pro). */
const BASE_WIDTH = 393;

/**
 * The short edge, i.e. the handset's width however it is held. Type and chrome
 * belong to the device, not to the orientation.
 */
const SHORT_EDGE = Math.min(SCREEN_WIDTH, SCREEN_HEIGHT);

/**
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
 *   person's accessibility choice twice — which is why the old `fontScale`
 *   stayed unused for as long as it existed.
 */
const SCALE_MIN = 0.94;
const SCALE_MAX = 1.06;

const DEVICE_SCALE = Math.min(
  SCALE_MAX,
  Math.max(SCALE_MIN, 1 + (SHORT_EDGE / BASE_WIDTH - 1) * 0.5)
);

/**
 * The type ramp's own scale — what `typography` and `chatType` are measured in.
 *
 * Every size in those two tables used to be a literal, tuned on one handset
 * (the S24, 384dp). On a narrow phone that ramp is cramped and on a wide one it
 * wastes the width it was given, and nothing in the code said which device it
 * had been fitted to.
 *
 * Rounded to half points: below that Android's layout rounding eats the
 * difference, and whole points would collapse neighbouring tiers into each other.
 */
export const typeScale = (size: number): number => Math.round(size * DEVICE_SCALE * 2) / 2;

/**
 * Everything that is not type: icon sizes, radii, gaps, toolbar padding.
 *
 * One function rather than the old horizontal/vertical pair. They read different
 * window axes, which mattered only while the factor was proportional — a clamped
 * one is the same number either way, so keeping two names would have been two
 * names for one behaviour.
 */
export const uiScale = (size: number): number => Math.round(size * DEVICE_SCALE);
