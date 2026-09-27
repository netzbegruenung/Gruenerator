import {
  TOOL_APPROVAL_OPTIONS,
  approvalDecidedLabel,
  formatNamespacedToolLabel,
  isApprovalDecided,
  type ToolApprovalState,
} from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { colors, spacing, borderRadius, chatType } from '../../../theme';

import type { Theme } from '../../../theme/colors';

// Native Gegenstück zu webs ToolApprovalCard. Bis 08/2026 gab es auf Mobile
// GAR KEINE Freigabe-Oberfläche: ein freigabepflichtiges Werkzeug blieb ein
// Shimmer, der nie auflöste, weil das Ergebnis auf eine Entscheidung wartete,
// die niemand treffen konnte. Optionen und Beschriftungen kommen aus dem
// geteilten Barrel, damit beide Plattformen dasselbe sagen.
export function ToolApprovalCard({
  toolName,
  args,
  approval,
  title,
  serverName,
  respondToApproval,
  theme,
}: {
  toolName: string;
  args: Record<string, unknown>;
  approval: ToolApprovalState;
  title?: string;
  serverName?: string;
  respondToApproval: (response: { approved: boolean; optionId?: string; reason?: string }) => void;
  theme: Theme;
}) {
  const [busy, setBusy] = useState(false);
  const [showArgs, setShowArgs] = useState(false);
  const label = title ?? formatNamespacedToolLabel(toolName, serverName);
  const hasArgs = Object.keys(args).length > 0;

  if (isApprovalDecided(approval)) {
    const denied = approval.approved === false || approval.resolution !== undefined;
    const icon = approval.resolution
      ? 'time-outline'
      : denied
        ? 'close-circle-outline'
        : 'checkmark-circle-outline';
    return (
      <View
        style={[styles.pill, { backgroundColor: theme.surface, borderColor: theme.border }]}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${label}: ${approvalDecidedLabel(approval)}`}
      >
        <Ionicons
          name={icon}
          size={14}
          color={denied ? theme.textSecondary : colors.primary[500]}
        />
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          {approvalDecidedLabel(approval)}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <View style={styles.head}>
        <Ionicons name="shield-outline" size={16} color={colors.primary[500]} />
        <View style={styles.headText}>
          <Text style={[styles.title, { color: theme.text }]}>{label} ausführen?</Text>
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            {serverName
              ? `${serverName} ist ein verbundener Dienst — der Aufruf verlässt den Grünerator.`
              : 'Dieses Werkzeug wirkt über die Antwort hinaus.'}
          </Text>
        </View>
      </View>

      {hasArgs && (
        <View style={styles.argsSection}>
          <Pressable
            onPress={() => setShowArgs((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={showArgs ? 'Übergabewerte ausblenden' : 'Übergabewerte anzeigen'}
            accessibilityState={{ expanded: showArgs }}
            style={styles.argsToggle}
          >
            <Text style={[styles.argsToggleText, { color: theme.textSecondary }]}>
              {showArgs ? 'Übergabewerte ausblenden' : 'Übergabewerte anzeigen'}
            </Text>
            <Ionicons
              name={showArgs ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={theme.textSecondary}
            />
          </Pressable>
          {showArgs && (
            <View style={[styles.argsBox, { backgroundColor: theme.card }]}>
              <Text selectable style={[styles.argsText, { color: theme.text }]}>
                {JSON.stringify(args, null, 2)}
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.actions}>
        {TOOL_APPROVAL_OPTIONS.map((option) => {
          const isPrimary = option.id === 'allow-once';
          return (
            <Pressable
              key={option.id}
              onPress={() => {
                setBusy(true);
                respondToApproval({
                  approved: option.kind !== 'reject-once',
                  optionId: option.id,
                });
              }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ disabled: busy }}
              style={[
                styles.button,
                isPrimary
                  ? { backgroundColor: colors.primary[500] }
                  : { borderWidth: 1, borderColor: theme.border },
                busy && styles.buttonBusy,
              ]}
            >
              <Text style={[styles.buttonText, { color: isPrimary ? colors.white : theme.text }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: spacing.small,
    padding: spacing.small,
    borderWidth: 1,
    borderRadius: borderRadius.large,
    gap: spacing.small,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xsmall },
  headText: { flex: 1, gap: 2 },
  title: { ...chatType.chatSecondary, fontWeight: '600' },
  meta: { ...chatType.chatMeta },
  argsSection: { gap: spacing.xxsmall },
  argsToggle: {
    minHeight: 44,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
  },
  argsToggleText: { ...chatType.chatMeta, fontWeight: '600' },
  argsBox: { padding: spacing.xsmall, borderRadius: borderRadius.medium },
  argsText: { ...chatType.chatMeta, fontFamily: 'monospace' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xsmall },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.full,
  },
  buttonBusy: { opacity: 0.6 },
  buttonText: { ...chatType.chatSecondary, fontWeight: '600' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    alignSelf: 'flex-start',
    marginVertical: spacing.xsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  label: { ...chatType.chatSecondary, fontWeight: '600' },
});
