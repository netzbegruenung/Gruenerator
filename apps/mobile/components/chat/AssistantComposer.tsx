import {
  ComposerRoot,
  ComposerInput,
  ComposerSend,
  ComposerCancel,
  useThreadIsRunning,
} from '@assistant-ui/react-native';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, ActivityIndicator } from 'react-native';

import { colors, spacing, borderRadius } from '../../theme';

import type { Theme } from '../../theme/colors';

interface Props {
  theme: Theme;
}

export function AssistantComposer({ theme }: Props) {
  const isRunning = useThreadIsRunning();

  return (
    <ComposerRoot
      style={[styles.root, { backgroundColor: theme.background, borderTopColor: theme.border }]}
    >
      <View style={[styles.inputRow, { backgroundColor: theme.surface }]}>
        <ComposerInput
          style={[styles.input, { color: theme.text }]}
          placeholder="Nachricht eingeben..."
          placeholderTextColor={theme.textSecondary}
          multiline
        />
        {isRunning ? (
          <ComposerCancel style={styles.cancelButton}>
            <ActivityIndicator size="small" color={colors.error[500]} />
          </ComposerCancel>
        ) : (
          <ComposerSend style={styles.sendButton}>
            <Ionicons name="send" size={18} color={colors.white} />
          </ComposerSend>
        )}
      </View>
    </ComposerRoot>
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
