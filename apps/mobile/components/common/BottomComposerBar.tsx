import { useEffect, useState } from 'react';
import { Keyboard, Platform, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

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
}: {
  placeholder?: string;
  onSend: (text: string) => void;
  onSettings?: () => void;
  showActionSheet?: boolean;
  onAttach?: ComposerProps['onAttach'];
  keyboardVerticalOffset?: number;
  autoFocus?: boolean;
  onDismissEmpty?: () => void;
  onClose?: () => void;
}) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const edge = useComposerEdge();

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

  // Keyboard open → collapse to the seam and let KeyboardAvoidingView lift the
  // composer (the tab bar hides, so there is nothing left to clear). The seam is
  // `COMPOSER_BOTTOM_INSET_RAISED` — the same number the thread's composer and the
  // start screen's docking spacer dock onto. This bar carried its own `spacing.xsmall`
  // from before that constant was measured, which put it 3.5dp tighter than the other
  // two composers on the same handset.
  const idlePadding = useTabBarClearance(spacing.xsmall);
  const paddingBottom = keyboardVisible ? typeScale(COMPOSER_BOTTOM_INSET_RAISED) : idlePadding;

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
      <View style={[edge, { paddingBottom }]}>
        <Composer
          variant="bar"
          testIDPrefix="tab-composer"
          placeholder={placeholder}
          onSubmit={onSend}
          onSettings={onSettings}
          showActionSheet={showActionSheet}
          onAttach={onAttach}
          autoFocus={autoFocus}
          onDismissEmpty={onDismissEmpty}
          onClose={onClose}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
