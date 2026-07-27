import { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '../../theme';
import { FLOATING_TAB_BAR_HEIGHT } from '../../theme/layout';

import { Composer } from './Composer';

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
  keyboardVerticalOffset = 0,
  autoFocus = false,
  onDismissEmpty,
  onClose,
}: {
  placeholder?: string;
  onSend: (text: string) => void;
  onSettings?: () => void;
  keyboardVerticalOffset?: number;
  autoFocus?: boolean;
  onDismissEmpty?: () => void;
  onClose?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // iOS: the floating tab bar is already inside insets.bottom, so clearing that inset +
  // a small gap sits the composer just above it. Android: the capsule tab bar is
  // absolutely positioned (ClassicTabLayout), so the navigator reserves no space for it
  // and the composer has to clear it itself. Keyboard open → collapse to a gap (the tab
  // bar hides) and let KeyboardAvoidingView lift the composer.
  const idlePadding =
    Platform.OS === 'ios'
      ? insets.bottom + spacing.xsmall
      : insets.bottom + FLOATING_TAB_BAR_HEIGHT + spacing.xsmall;
  const paddingBottom = keyboardVisible ? spacing.xsmall : idlePadding;

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
      <View style={[styles.wrap, { paddingBottom }]}>
        <Composer
          variant="bar"
          testIDPrefix="tab-composer"
          placeholder={placeholder}
          onSubmit={onSend}
          onSettings={onSettings}
          autoFocus={autoFocus}
          onDismissEmpty={onDismissEmpty}
          onClose={onClose}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.xsmall,
  },
});
