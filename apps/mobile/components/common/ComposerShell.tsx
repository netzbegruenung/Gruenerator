import { View, StyleSheet, useColorScheme } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, borderRadius, BODY_FONT } from '../../theme';

import type { Theme } from '../../theme/colors';
import type { StyleProp, ViewStyle, TextStyle } from 'react-native';

/**
 * The app's two composer looks:
 *
 * - `card` — input on top, action toolbar in a row below. The tall focal input of
 *   the start/chat/notebook landings and the in-thread chat composer.
 * - `bar`  — one pill-shaped row, input grows between the controls. The
 *   bottom-pinned, keyboard-aware composer on the tab screens.
 *
 * `ComposerShell` is the look only — no text state, no behaviour. `Composer`
 * (same folder) is the one component that drives it. Web's equivalent split is
 * `GrueneratorComposer`'s `card | pill` variants.
 */
export type ComposerVariant = 'card' | 'bar';

/** Default height of the `card` box — the landing heroes' focal input. */
export const COMPOSER_CARD_MIN_HEIGHT = 130;

interface ComposerShellProps {
  variant?: ComposerVariant;
  /** Overrides `useTheme()` for surfaces that thread their own theme (docs sidebar). */
  theme?: Theme;
  /** `card` only. Height of the box at rest; defaults to `COMPOSER_CARD_MIN_HEIGHT`. */
  minHeight?: number;
  /**
   * Style for the wrapper around the box. The shell deliberately adds no outer
   * padding or background of its own: a composer embedded in a padded column
   * (landing heroes) must sit flush, while a screen-edge one supplies its own
   * padding, safe-area inset and backdrop.
   */
  style?: StyleProp<ViewStyle>;
  /** Above the box — attachment chips, mention suggestions. */
  aboveBox?: React.ReactNode;
  /** The text input. Supplied by the controller, which owns the text state. */
  input: React.ReactNode;
  /** Far-left control — plus menu or settings button. */
  leading?: React.ReactNode;
  /** Beside `leading`, still left-aligned — e.g. the notebook filter accessory. */
  toolbarExtra?: React.ReactNode;
  /** Far-right control — the merged mic / send / cancel button. */
  action: React.ReactNode;
}

export function ComposerShell({
  variant = 'card',
  theme: themeProp,
  minHeight = COMPOSER_CARD_MIN_HEIGHT,
  style,
  aboveBox,
  input,
  leading,
  toolbarExtra,
  action,
}: ComposerShellProps) {
  const resolvedTheme = useTheme();
  const theme = themeProp ?? resolvedTheme;
  const isBar = variant === 'bar';
  // The composer is the plate, not another shade of the page: white on light,
  // the card tone on dark. Both surfaces it sits on (chat vanilla, notebook
  // magenta) are tinted, so `theme.surface` washed into them.
  const fill = useColorScheme() === 'dark' ? theme.card : colors.white;

  return (
    <View style={style}>
      {aboveBox}
      {isBar ? (
        // No border and no shadow: the bar sits on the sunrise gradient, and the
        // surface fill alone carries enough contrast to read as a distinct surface.
        <View style={[styles.bar, { backgroundColor: fill }]}>
          {leading}
          {toolbarExtra}
          {input}
          {action}
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: fill, minHeight }]}>
          {input}
          <View style={styles.toolbar}>
            {leading}
            {toolbarExtra}
            <View style={styles.spacer} />
            {action}
          </View>
        </View>
      )}
    </View>
  );
}

const buttonStyles = StyleSheet.create({
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardAction: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Bar-only. The row is `alignItems: 'flex-end'` so the buttons stay beside the
  // LAST line once the input grows — but that bottom-aligns them against the
  // input, which is taller than either button (lineHeight 24 + 12/12 padding =
  // 48). Without compensation both sit below the text they belong to, and 2dp
  // apart from each other, since they are not the same size.
  //
  // marginBottom lifts each button's centre onto the text line's centre, which
  // sits paddingBottom(12) + lineHeight/2(14.5) = 26.5dp above the content bottom:
  //   icon: 26.5 - 38/2 = 7    action: 26.5 - 42/2 = 5
  // Correct for the multi-line case too — the target is the last line, not the
  // input's outer box.
  //
  // The `card` variant centres its toolbar in a row of its own and needs none of
  // this, which is why these are separate styles rather than edits above.
  barIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginBottom: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  barAction: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginBottom: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

/**
 * Chrome for a composer's secondary (left) control. Returned as a style rather
 * than a component because the assistant-ui controller renders its buttons
 * through `ComposerPrimitive.*`, which take a `style` and not children slots.
 */
export function composerIconButtonStyle(variant: ComposerVariant): ViewStyle {
  return variant === 'bar' ? buttonStyles.barIcon : buttonStyles.cardIcon;
}

/** Chrome for the merged mic / send / cancel button. Callers add the fill colour. */
export function composerActionButtonStyle(variant: ComposerVariant): ViewStyle {
  return variant === 'bar' ? buttonStyles.barAction : buttonStyles.cardAction;
}

/** Icon size matching the variant's button chrome. */
export function composerIconSize(variant: ComposerVariant): number {
  return variant === 'bar' ? 20 : 22;
}

/** Fill for the send/cancel button in its active (primary) state. */
export const COMPOSER_ACTION_FILL = colors.primary[600];

const inputStyles = StyleSheet.create({
  // PT Sans, the body face web sets after Raleway, one fifth larger than the
  // system default sizes this used to carry (16/17 → 19/20).
  card: {
    flex: 1,
    fontFamily: BODY_FONT,
    fontSize: 19,
    lineHeight: 26,
    minHeight: 40,
    maxHeight: 132,
    paddingVertical: 0,
    textAlignVertical: 'top',
  },
  bar: {
    flex: 1,
    fontFamily: BODY_FONT,
    fontSize: 20,
    lineHeight: 29,
    maxHeight: 145,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: spacing.xxsmall,
  },
});

/** Typography + growth bounds for the input, so both controllers size it alike. */
export function composerInputStyle(variant: ComposerVariant): TextStyle {
  return variant === 'bar' ? inputStyles.bar : inputStyles.card;
}

const styles = StyleSheet.create({
  // Elevation is what separates the card from what sits behind it — the landing
  // hero's page background, the chat thread's message list. The in-thread
  // composer had none before this shell and now picks it up.
  // No border, no shadow — the fill alone separates it from the page.
  card: {
    borderRadius: borderRadius.xlarge,
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.small,
    paddingBottom: spacing.xsmall,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    marginTop: spacing.xsmall,
  },
  spacer: {
    flex: 1,
  },
  // Sizing is ~10% up from the original 52dp bar. minHeight is deliberately the
  // natural content height (input 48 + 5/5 padding), not a round number above
  // it: the row is `alignItems: 'flex-end'`, so any minHeight in excess of the
  // content becomes slack that lands on TOP and pushes everything down.
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: borderRadius.pill,
    paddingLeft: spacing.xsmall,
    paddingRight: spacing.xxsmall,
    paddingVertical: 5,
    minHeight: 64,
    gap: spacing.xxsmall,
  },
});
