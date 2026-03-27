import { type ReactNode } from 'react';
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lightTheme, darkTheme, colors } from '../../theme';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  maxHeight?: `${number}%` | number;
  keyboardAvoiding?: boolean;
}

export function BottomSheet({
  visible,
  onClose,
  children,
  maxHeight = '85%',
  keyboardAvoiding,
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
            paddingBottom: insets.bottom || 16,
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
        >
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
