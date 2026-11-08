import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useTabBarClearance } from '../../hooks/useTabBarClearance';
import { spacing, typeScale } from '../../theme';
import { COMPOSER_BOTTOM_INSET_RAISED } from '../../theme/layout';

import { Composer, useComposerEdge, type ComposerProps } from './Composer';

/**
 * Bottom-pinned, keyboard-aware composer bar (ChatGPT-style) for the tab screens.
 * Wraps the `Composer`'s `bar` variant in the same `KeyboardAvoidingView` mechanism the
 * chat thread uses (react-native-keyboard-controller; `KeyboardProvider` is mounted in
 * app/_layout.tsx). Place it as the last child of a `flex: 1` column beneath the
 * scrollable content.
 */
export function BottomComposerBar({
  placeholder,
  onSend,
  onSettings,
  showActionSheet,
  onAttach,
  keyboardVerticalOffset = 0,
  autoFocus = false,
  onDismissEmpty,
  onClose,
  onTextChange,
  submitAs,
  showMentions,
  accessory,
  accessoryBesideAction,
  accentColor,
  header,
  variant = 'bar',
  minHeight,
  toolbarTone,
  submitOnEnter,
}: {
  placeholder?: string;
  /** Return `false` to keep the text in the field (a search, not a send). */
  onSend: (text: string) => void | false;
  onSettings?: () => void;
  showActionSheet?: boolean;
  onAttach?: ComposerProps['onAttach'];
  keyboardVerticalOffset?: number;
  autoFocus?: boolean;
  onDismissEmpty?: () => void;
  onClose?: () => void;
  onTextChange?: ComposerProps['onTextChange'];
  submitAs?: ComposerProps['submitAs'];
  showMentions?: ComposerProps['showMentions'];
  accessory?: ComposerProps['accessory'];
  accessoryBesideAction?: ComposerProps['accessoryBesideAction'];
  accentColor?: ComposerProps['accentColor'];
  /** `card` stacks the input above its toolbar (two rows); `bar` is one pill. */
  variant?: ComposerProps['variant'];
  minHeight?: ComposerProps['minHeight'];
  toolbarTone?: ComposerProps['toolbarTone'];
  submitOnEnter?: ComposerProps['submitOnEnter'];
  /** Rides on top of the composer, up with the keyboard (filter chips, a hint). */
  header?: ReactNode;
}) {
  const edge = useComposerEdge();

  // Keyboard open → collapse to the seam and let KeyboardAvoidingView lift the
  // composer. The seam is `COMPOSER_BOTTOM_INSET_RAISED` — the same number the
  // thread's composer and the start screen's docking spacer dock onto. This bar
  // carried its own `spacing.xsmall` from before that constant was measured, which
  // put it 3.5dp tighter than the other two composers on the same handset.
  //
  // `behavior="padding"` lifts the bar until its bottom meets the keyboard, so the
  // gap above the keyboard IS this padding. It used to switch between the two
  // numbers on `keyboardWillShow`/`keyboardDidShow` — a React render that dropped
  // the composer 16dp in one frame (measured on a Pixel 7, 08.11.2026) and threw
  // it back up on close. Interpolated with the keyboard's own progress on the UI
  // thread instead, it changes with the keyboard and never in a step. Both ends
  // are numbers computed here: the worklet must not call `typeScale`.
  const idlePadding = useTabBarClearance(spacing.xsmall);
  const raisedPadding = typeScale(COMPOSER_BOTTOM_INSET_RAISED);
  const keyboard = useReanimatedKeyboardAnimation();
  const dockPadding = useAnimatedStyle(() => ({
    paddingBottom: idlePadding + (raisedPadding - idlePadding) * keyboard.progress.get(),
  }));

  return (
    // `automaticOffset`: the bar is nested below the header + inside a flex column,
    // so its onLayout frame is relative to that parent — not the window. Without this
    // the padding lift under-shoots by the header + safe-area height and the keyboard
    // covers the composer. It re-measures the true screen-absolute position instead.
    <KeyboardAvoidingView
      behavior="padding"
      automaticOffset
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <Animated.View style={[edge, dockPadding]}>
        {header}
        <Composer
          variant={variant}
          minHeight={minHeight}
          toolbarTone={toolbarTone}
          submitOnEnter={submitOnEnter}
          testIDPrefix="tab-composer"
          placeholder={placeholder}
          onSubmit={onSend}
          onSettings={onSettings}
          showActionSheet={showActionSheet}
          onAttach={onAttach}
          autoFocus={autoFocus}
          onDismissEmpty={onDismissEmpty}
          onClose={onClose}
          onTextChange={onTextChange}
          submitAs={submitAs}
          showMentions={showMentions}
          accessory={accessory}
          accessoryBesideAction={accessoryBesideAction}
          accentColor={accentColor}
        />
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
