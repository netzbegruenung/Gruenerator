import { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '../../theme';

import { ComposerCard } from './ComposerCard';

/**
 * Bottom-pinned, keyboard-aware composer bar (ChatGPT-style) for the tab screens.
 * Wraps the compact `ComposerCard` in the same `KeyboardAvoidingView` mechanism the
 * chat thread uses (react-native-keyboard-controller; `KeyboardProvider` is mounted in
 * app/_layout.tsx). Place it as the last child of a `flex: 1` column beneath the
 * scrollable content.
 */
export function BottomComposerBar({
  placeholder,
  onSend,
  onSettings,
  keyboardVerticalOffset = 0,
}: {
  placeholder?: string;
  onSend: (text: string) => void;
  onSettings?: () => void;
  keyboardVerticalOffset?: number;
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
  // a small gap sits the composer just above it. Android: content is laid out above the
  // JS tab bar already, so only a small gap is needed. Keyboard open → collapse to a gap
  // (the tab bar is covered) and let KeyboardAvoidingView lift the composer.
  const idlePadding = Platform.OS === 'ios' ? insets.bottom + spacing.xsmall : spacing.small;
  const paddingBottom = keyboardVisible ? spacing.xsmall : idlePadding;

  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={keyboardVerticalOffset}>
      <View style={[styles.wrap, { paddingBottom }]}>
        <ComposerCard
          variant="compact"
          placeholder={placeholder}
          onSend={onSend}
          onSettings={onSettings}
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
