import {
  TOOL_GRANT_OPTIONS,
  answerToolGrant,
  toolGrantResolvedLabel,
  toolGrantSubtitle,
  toolGrantTitle,
  toolGrantTools,
  type McpToolGrant,
  type McpToolGrantScope,
} from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { colors, spacing, borderRadius, chatType } from '../../../theme';

import type { Theme } from '../../../theme/colors';

// Native Gegenstück zu webs ToolGrantCard: neue oder geänderte Werkzeuge eines
// verbundenen Servers freigeben. Texte und POST kommen aus dem geteilten
// Barrel, damit beide Plattformen dasselbe sagen und dasselbe tun.
export function ToolGrantCard({ grant, theme }: { grant: McpToolGrant; theme: Theme }) {
  const [resolved, setResolved] = useState<McpToolGrantScope | null>(grant.resolved ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (resolved) {
    const denied = resolved === 'denied';
    return (
      <View
        style={[styles.pill, { backgroundColor: theme.surface, borderColor: theme.border }]}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${grant.serverName}: ${toolGrantResolvedLabel(resolved)}`}
      >
        <Ionicons
          name={denied ? 'close-circle-outline' : 'checkmark-circle-outline'}
          size={14}
          color={denied ? theme.textSecondary : colors.primary[500]}
        />
        <Text style={[styles.label, { color: theme.text }]}>{grant.serverName}</Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          {toolGrantResolvedLabel(resolved)}
        </Text>
      </View>
    );
  }

  const answer = async (scope: McpToolGrantScope): Promise<void> => {
    if (!grant.threadId) return;
    setBusy(true);
    setError(null);
    const outcome = await answerToolGrant(grant, grant.threadId, scope);
    setBusy(false);
    if (outcome.status === 'resolved') setResolved(outcome.scope);
    else setError(outcome.message);
  };

  const disabled = busy || !grant.threadId;

  return (
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <View style={styles.head}>
        <Ionicons name="key-outline" size={16} color={colors.primary[500]} />
        <View style={styles.headText}>
          <Text style={[styles.title, { color: theme.text }]}>{toolGrantTitle(grant)}</Text>
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            {toolGrantSubtitle(grant)}
          </Text>
        </View>
      </View>

      <View style={[styles.reach, { backgroundColor: theme.card }]}>
        {toolGrantTools(grant).map((tool) => (
          <Text key={tool} style={[styles.tool, { color: theme.text }]}>
            {tool}
          </Text>
        ))}
      </View>

      <View style={styles.actions}>
        {TOOL_GRANT_OPTIONS.map((option) => {
          const isPrimary = option.scope === 'session';
          return (
            <Pressable
              key={option.scope}
              onPress={() => void answer(option.scope)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ disabled }}
              style={[
                styles.button,
                isPrimary
                  ? { backgroundColor: colors.primary[500] }
                  : { borderWidth: 1, borderColor: theme.border },
                disabled && styles.buttonBusy,
              ]}
            >
              <Text style={[styles.buttonText, { color: isPrimary ? colors.white : theme.text }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error && (
        <Text accessibilityRole="alert" style={[styles.meta, { color: colors.error[500] }]}>
          {error}
        </Text>
      )}
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
  reach: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
    padding: spacing.xsmall,
    borderRadius: borderRadius.medium,
  },
  tool: { ...chatType.chatMeta, fontFamily: 'monospace' },
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
