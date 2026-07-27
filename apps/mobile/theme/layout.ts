/**
 * Layout constants that have to be known on both sides of a navigator boundary.
 *
 * They live here rather than in `components/navigation` so that a screen can
 * import a number without pulling expo-router's `Tabs` into its module graph.
 */

/** Height of the Android capsule tab bar. */
export const TAB_BAR_CAPSULE_HEIGHT = 60;

/** Gap between the capsule and the bottom safe-area inset below it. */
export const TAB_BAR_CAPSULE_GAP = 8;

/**
 * What the Android tab bar occupies above the bottom safe-area inset. The bar is
 * absolutely positioned (see `ClassicTabLayout`) so that screen backgrounds run
 * underneath it — which means React Navigation reserves no layout space for it,
 * and anything bottom-pinned inside a tab screen has to clear
 * `insets.bottom + FLOATING_TAB_BAR_HEIGHT` itself.
 *
 * iOS does not need this: `NativeTabs` is a real UIKit tab bar and its height is
 * already part of `insets.bottom`.
 */
export const FLOATING_TAB_BAR_HEIGHT = TAB_BAR_CAPSULE_HEIGHT + TAB_BAR_CAPSULE_GAP;

/**
 * Horizontal screen margin for edge-pinned content — composers, hero greetings,
 * the tab landings. One number so a headline and the composer below it share an
 * optical edge; 16 (spacing.medium) read tight under a 28pt greeting.
 */
export const SCREEN_EDGE = 20;

/**
 * What a bottom-pinned composer keeps under itself, *on top of* the safe-area
 * inset.
 *
 * The inset alone is the system's requirement, not a design: it clears the
 * gesture bar and nothing more, which leaves the composer looking dropped onto
 * the bottom edge. Measured against ChatGPT on the same handset (S24, 3.0 px/dp,
 * 360dp wide): its pill's underside sits 34.2dp above the screen edge, and the
 * navigation inset there is 15dp — so 19dp of that is its own.
 *
 * Rounded to 20 so it reads as one step of the spacing scale rather than as a
 * measurement, and passed through `typeScale` at the call site so a narrow phone
 * gives up a little of it and a wide one gains a little.
 */
export const COMPOSER_BOTTOM_INSET = 20;
