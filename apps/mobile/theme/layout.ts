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
 * Where a tablet begins.
 *
 * Phones are portrait-locked (app.json `orientation: "portrait"`) at ≤ ~440pt
 * wide. The smallest iPad in portrait is the mini at 744pt, so 700 cleanly
 * separates tablets from phones while still treating a narrow iPad Split View
 * column as a phone — which is what it is, however large the slab around it.
 */
export const TABLET_MIN_WIDTH = 700;

/**
 * Horizontal screen margin for edge-pinned content — composers, hero greetings,
 * the tab landings. One number so a headline and the composer below it share an
 * optical edge; 16 (spacing.medium) read tight under a 28pt greeting.
 *
 * Two numbers now, because 20 is a share of the width and not an absolute: on a
 * 360dp handset it is 5.6% per side, on a 1024dp iPad 2.0%. Read them through
 * `useLayout().edge` rather than importing the right one at each call site — and
 * never from inside `StyleSheet.create`, which is evaluated once at import and
 * cannot see a window that changed.
 */
export const SCREEN_EDGE = 20;
export const SCREEN_EDGE_WIDE = 32;

/**
 * The two widths content is allowed to reach, mirroring what web already caps at
 * (`ChatHero`: `max-w-3xl` around the composer, `max-w-5xl` around the hero).
 *
 * Nothing on mobile capped anything before, so every tab screen was a phone
 * layout stretched: the composer ran 984dp wide on an iPad, chat bubbles reached
 * 836dp — about 145 characters a line, against the 60–80 that reads.
 *
 * `READING` is for anything with a text measure: hero, composer, chat thread,
 * forms. `GRID` is for tile fields and lists, which carry no line length and can
 * use the extra width for another column.
 */
export const CONTENT_MAX_WIDTH = 768;
export const GRID_MAX_WIDTH = 1024;

/**
 * How many columns fit, from the tile size rather than from the device class.
 *
 * The distinction is the whole point. `isTablet ? 3 : 2` keeps the *count* near
 * the phone's and lets the tile inflate — which is how a 154dp tool tile became
 * a 320dp one with a 28dp icon still pinned in its corner. Deriving the count
 * holds the tile still and spends the extra width on more of them.
 *
 * The floor of 2 is what keeps a phone at two columns: 320dp of usable width
 * fits only one 160dp tile plus its gap, and one column of squares is a list
 * that forgot it was a list.
 */
export function gridColumns(available: number, minTile: number, gap: number): number {
  return Math.max(2, Math.floor((available + gap) / (minTile + gap)));
}

/**
 * What a bottom-pinned composer keeps under itself — two numbers, because the
 * right answer is not the same with the keyboard up and down.
 *
 * Measured against ChatGPT on the same handset (S24, 3.0 px/dp, 360dp wide),
 * and the pair of measurements is the whole point:
 *
 * - **Keyboard down**, its pill sits 34.2dp above the screen edge. The
 *   navigation inset is 15dp of that, so 19dp is its own.
 * - **Keyboard up**, 12.0dp — and no inset at all.
 *
 * Two things follow. The safe-area inset is dropped once the keyboard is up:
 * the gesture bar is behind the keyboard, so there is nothing left to clear, and
 * keeping it would hold the composer 15dp off the keys for no reason. And the
 * composer's own breathing room shrinks too — floating over content it needs
 * separation from the screen edge, docked onto the keyboard it only needs a
 * seam.
 *
 * Ours came out at 34dp in *both* states before this, because it added inset
 * plus padding unconditionally — 22dp too high while typing.
 *
 * `RAISED` is 12 rather than 12.0-to-the-decimal: through `typeScale` it lands
 * at 11.5dp here, half a point tighter than ChatGPT and 1.5 physical pixels off.
 */
export const COMPOSER_BOTTOM_INSET = 20;
export const COMPOSER_BOTTOM_INSET_RAISED = 12;

/**
 * The bottom spacer of a block that is centred while the keyboard is down and
 * docks onto it while it is up. `resting` is what the block keeps under itself
 * with the keyboard away (safe-area inset, tab bar, gap), `raised` the seam it
 * keeps once docked. Both are computed on the JS thread by the caller (insets,
 * `typeScale`) and handed over as numbers — a worklet may capture numbers, it
 * may not call back into a module.
 *
 * The two arguments from the keyboard do different jobs, and it is a bug to let
 * either do the other's:
 *
 * - `progress` (0 → 1) paces the *centring*. It has to be presence, not extent,
 *   so the block glides while the keyboard travels instead of diving to meet it
 *   and rising again. Android does not clamp it — `persistentKeyboardHeight` is
 *   deliberately stale across a switch to a taller emoji panel — so a value
 *   above 1 is possible and would otherwise give the spacer a negative flexGrow.
 * - `keyboardHeight` (dp, ≥ 0) sets the *clearance*. A keyboard that covers less
 *   than the resting clearance has to give the rest of it back: with a hardware
 *   or floating keyboard `progress` still reaches 1 while only a ~55dp shortcut
 *   strip is on screen, and pacing the height off `progress` would drop the
 *   block to the seam and leave it behind the Android tab bar.
 *
 * So the block never keeps less than `resting` between itself and the screen
 * edge, counting what the keyboard already occupies.
 *
 * The `'worklet'` directive is what lets `useAnimatedStyle` call this on the UI
 * thread; under Node it is an inert string, which is what lets the geometry be
 * unit-tested.
 */
export function dockingSpacer(
  progress: number,
  keyboardHeight: number,
  resting: number,
  raised: number
): { flexGrow: number; height: number } {
  'worklet';
  return {
    flexGrow: Math.max(0, 1 - progress),
    height: Math.max(resting - keyboardHeight, raised),
  };
}

/**
 * A section that folds away as the keyboard comes up. `measuredHeight` is its
 * natural height from `onLayout`; until that is known no height is set at all —
 * a height of 0 from a measurement that never happened would keep the section
 * from ever laying out, and so from ever reporting one.
 *
 * `progress` is clamped for the same reason `dockingSpacer` clamps it: the
 * callers hand both of them the same unclamped shared value, and above 1 this
 * would otherwise return a negative opacity and a negative height.
 */
export function collapsingSection(
  progress: number,
  measuredHeight: number
): { opacity: number; height?: number } {
  'worklet';
  const open = Math.max(0, 1 - progress);
  return measuredHeight > 0 ? { opacity: open, height: measuredHeight * open } : { opacity: open };
}
