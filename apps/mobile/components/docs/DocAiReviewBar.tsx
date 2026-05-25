import { Ionicons } from '@react-native-vector-icons/ionicons';
import { memo } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';

import { useDocsEditorBridgeStore } from '../../stores/docsEditorBridgeStore';
import { lightTheme, darkTheme, colors, spacing, borderRadius } from '../../theme';

/**
 * Native AI review bar — shown while an AI suggestion awaits accept/reject.
 * Replaces the suppressed web AI popover on mobile. Dispatches accept-ai /
 * reject-ai actions through the bridge store, which the DOM editor turns into
 * acceptDocumentAI / rejectDocumentAI calls.
 */
export const DocAiReviewBar = memo(function DocAiReviewBar() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const dispatchAction = useDocsEditorBridgeStore((s) => s.dispatchAction);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.background, borderBottomColor: theme.border },
      ]}
    >
      <View style={styles.labelRow}>
        <Ionicons name="sparkles" size={16} color={colors.secondary[600]} />
        <Text style={[styles.label, { color: theme.text }]}>KI-Vorschlag</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => dispatchAction({ type: 'reject-ai' })}
          style={[styles.button, styles.rejectButton, { borderColor: theme.border }]}
          accessibilityLabel="KI-Vorschlag verwerfen"
        >
          <Text style={[styles.rejectLabel, { color: theme.textSecondary }]}>Verwerfen</Text>
        </Pressable>
        <Pressable
          onPress={() => dispatchAction({ type: 'accept-ai' })}
          style={[styles.button, { backgroundColor: colors.secondary[600] }]}
          accessibilityLabel="KI-Vorschlag übernehmen"
        >
          <Text style={styles.acceptLabel}>Übernehmen</Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    gap: spacing.small,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  button: {
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.medium,
  },
  rejectButton: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  rejectLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  acceptLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
});
