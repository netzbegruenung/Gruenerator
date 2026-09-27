import { getToolMeta, getToolQuery } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { View, Text, StyleSheet } from 'react-native';

import { colors, spacing, borderRadius, BODY_FONT, chatType } from '../../../theme';

import type { Theme } from '../../../theme/colors';

// Native Gegenstück zu webs <ToolError>. Ein fehlgeschlagenes Werkzeug sah
// vorher aus wie ein erfolgreiches: die Fehlermeldung lief als graue Notiz
// durch dieselbe Erfolgs-Karte. Gleiche Worte wie Web (geteilte Metadaten),
// eigene Form.
export function ToolErrorCard({
  toolName,
  args,
  message,
  theme,
}: {
  toolName: string;
  args: Record<string, unknown>;
  message: string;
  theme: Theme;
}) {
  const meta = getToolMeta(toolName);
  const target = getToolQuery(args, toolName);

  return (
    <View style={styles.wrap}>
      <View style={[styles.head, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Ionicons name="alert-circle-outline" size={14} color={colors.error[500]} />
        <Text style={[styles.label, { color: theme.text }]}>{meta.label}</Text>
        {target && (
          <Text style={[styles.query, { color: theme.textSecondary }]} numberOfLines={1}>
            „{target}“
          </Text>
        )}
        <Text style={[styles.tag, { color: theme.textSecondary }]}>fehlgeschlagen</Text>
      </View>
      <Text style={[styles.message, { color: colors.error[500] }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.xsmall },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  label: { ...chatType.chatSecondary, fontWeight: '600' },
  query: { ...chatType.chatMeta, flexShrink: 1, fontFamily: BODY_FONT },
  tag: { ...chatType.chatMeta },
  message: {
    ...chatType.chatMeta,
    marginTop: spacing.xxsmall,
    marginLeft: spacing.xsmall,
  },
});
