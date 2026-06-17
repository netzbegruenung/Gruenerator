import { type ReactNode } from 'react';
import { View, Modal, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lightTheme, darkTheme, colors, spacing } from '../../theme';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  maxHeight?: `${number}%` | number;
  keyboardAvoiding?: boolean;
  /**
   * Apply a standard horizontal content inset to the sheet. Opt-in because most
   * sheets pad their own rows/sections; turn it on for sheets whose content (e.g.
   * full-width buttons, chips) would otherwise sit flush against the edges.
   */
  padded?: boolean;
}

export function BottomSheet({
  visible,
  onClose,
  children,
  maxHeight = '85%',
  keyboardAvoiding,
  padded,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  const content = (
    <>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Pressable
        style={[
          styles.sheet,
          {
            // Always keep a comfortable gap below the last element — the safe-area
            // inset (often 0 inside a RN Modal) plus a fixed cushion.
            paddingBottom: Math.max(insets.bottom, spacing.medium) + spacing.medium,
            paddingHorizontal: padded ? spacing.medium : undefined,
            backgroundColor: theme.background,
            borderColor: theme.border,
            maxHeight,
          },
        ]}
        onPress={() => {}}
      >
        <View style={styles.handleRow}>
          <View
            style={[
              styles.handle,
              { backgroundColor: isDark ? colors.grey[600] : colors.grey[300] },
            ]}
          />
        </View>
        {children}
      </Pressable>
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
    >
      {keyboardAvoiding ? (
        <KeyboardAvoidingView behavior="padding" style={styles.container}>
          {content}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.container}>{content}</View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
});
