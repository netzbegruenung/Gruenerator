import { View, StyleSheet, useColorScheme } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, borderRadius, chatType } from '../../theme';

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

/**
 * The composer types in `chatBody` — the same tier as the answers above it.
 *
 * It carried its own 19/20 before, a fifth above the system default, and that
 * was a size rather than a decision: nothing else in the app was that big, so
 * the thing you type in read louder than the conversation it joins. Measured
 * against Claude's Android composer on the same handset (x-height 28px against
 * our 32px, i.e. ≈17.5dp against our 20), ours was ~14% larger.
 *
 * `chatBody` rather than a literal 17: it is the tier that means "a sentence
 * someone reads", which is what a draft is, and it moves with the screen
 * through `typeScale` instead of being fitted to one handset.
 */
const LINE_HEIGHT = Number(chatType.chatBody.lineHeight);

const BAR_INPUT_PADDING_V = 12;
const BAR_PADDING_V = 5;
const BAR_ICON_SIZE = 38;
const BAR_ACTION_SIZE = 42;
const BAR_MAX_LINES = 4;
const CARD_MAX_LINES = 5;

const BAR_INPUT_HEIGHT = LINE_HEIGHT + BAR_INPUT_PADDING_V * 2;

/**
 * The bar's height while the draft is one line — the shape it is designed as.
 *
 * Derived rather than written down: it was a literal until the type moved under
 * it, and the comment explaining it had been quoting a line height two revisions
 * out of date while the arithmetic used the current one. A formula cannot fall
 * out of step with itself.
 */
const BAR_RESTING_HEIGHT = BAR_INPUT_HEIGHT + BAR_PADDING_V * 2;

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

  // Bar-only. Nothing but size: the row centres them (see `styles.bar`), so
  // neither carries a margin of its own.
  //
  // The sizes stay fixed while the type scales: a touch target is set by the
  // finger, not by the screen it sits on.
  barIcon: {
    width: BAR_ICON_SIZE,
    height: BAR_ICON_SIZE,
    borderRadius: BAR_ICON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  barAction: {
    width: BAR_ACTION_SIZE,
    height: BAR_ACTION_SIZE,
    borderRadius: BAR_ACTION_SIZE / 2,
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
  card: {
    flex: 1,
    ...chatType.chatBody,
    minHeight: 40,
    maxHeight: LINE_HEIGHT * CARD_MAX_LINES,
    paddingVertical: 0,
    textAlignVertical: 'top',
  },
  bar: {
    flex: 1,
    ...chatType.chatBody,
    maxHeight: LINE_HEIGHT * BAR_MAX_LINES + BAR_INPUT_PADDING_V * 2,
    paddingTop: BAR_INPUT_PADDING_V,
    paddingBottom: BAR_INPUT_PADDING_V,
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
  // minHeight is deliberately the natural content height, not a round number
  // above it: it also sets the radius below, so a value in excess of the content
  // would round a shape the bar never actually has. Computed, so the capsule
  // keeps hugging the text when the type scales.
  bar: {
    flexDirection: 'row',
    // Centred, like web's pill (`items-center`). The row was `flex-end` with a
    // per-button `marginBottom` that pinned each glyph onto the LAST text line —
    // exact while the draft was one line, since the line's centre IS the pill's
    // centre then, but visibly wrong the moment it wrapped: at two lines both
    // buttons sat half a line below the middle of a capsule that had grown
    // around them.
    alignItems: 'center',
    // Half the RESTING height, not `full`. `pill` (24) was too little — it left
    // a straight segment on each end and the bar read as a rounded rectangle
    // beside web's capsule (measured on the emulator: the edge stopped curving
    // 23dp in). But `full` tracks half the GROWN height, so every wrapped line
    // widened the end arcs by half a line around buttons that never change size.
    // Freezing it here is web's own fix (`rounded-[1.875rem]`, and the comment
    // above it): a true capsule at rest, a rounded rect once it grows.
    borderRadius: BAR_RESTING_HEIGHT / 2,
    paddingLeft: spacing.xsmall,
    paddingRight: spacing.xxsmall,
    paddingVertical: BAR_PADDING_V,
    minHeight: BAR_RESTING_HEIGHT,
    gap: spacing.xxsmall,
  },
});
