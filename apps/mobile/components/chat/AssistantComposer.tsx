import {
  ComposerRoot,
  ComposerSend,
  ComposerCancel,
  useThreadIsRunning,
  useAui,
} from '@assistant-ui/react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useRef } from 'react';
import { View, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

import { colors, spacing, borderRadius } from '../../theme';

import type { Theme } from '../../theme/colors';

interface Props {
  theme: Theme;
  bottomInset?: number;
}

const stickyOffset = { closed: 0, opened: 0 };

export function AssistantComposer({ theme, bottomInset = 0 }: Props) {
  const isRunning = useThreadIsRunning();
  const aui = useAui();
  const inputRef = useRef<TextInput>(null);

  const onChangeText = useCallback(
    (value: string) => {
      aui.composer().setText(value);
    },
    [aui]
  );

  const bottomPadding = useMemo(() => ({ paddingBottom: bottomInset }), [bottomInset]);

  return (
    <KeyboardStickyView offset={stickyOffset}>
      <ComposerRoot
        style={[styles.root, { backgroundColor: theme.background, borderTopColor: theme.border }]}
      >
        <View style={[styles.inputRow, { backgroundColor: theme.surface }]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: theme.text }]}
            placeholder="Nachricht eingeben..."
            placeholderTextColor={theme.textSecondary}
            multiline
            onChangeText={onChangeText}
          />
          {isRunning ? (
            <ComposerCancel style={styles.cancelButton}>
              <ActivityIndicator size="small" color={colors.error[500]} />
            </ComposerCancel>
          ) : (
            <ComposerSend
              style={styles.sendButton}
              onPress={() => {
                inputRef.current?.clear();
              }}
            >
              <Ionicons name="send" size={18} color={colors.white} />
            </ComposerSend>
          )}
        </View>
      </ComposerRoot>
      <View style={bottomPadding} />
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: borderRadius.large,
    paddingLeft: spacing.medium,
    paddingRight: spacing.xsmall,
    paddingVertical: spacing.xsmall,
    minHeight: 44,
  },
  input: {
    flex: 1,
    fontSize: 16,
    maxHeight: 120,
    paddingVertical: spacing.xsmall,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary[600],
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.xsmall,
  },
  cancelButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.xsmall,
  },
});
