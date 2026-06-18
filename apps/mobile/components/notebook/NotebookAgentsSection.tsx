import { getVisibleSystemAgentsForLocale, type Agent } from '@gruenerator/shared/agents';
import { useAuth } from '@gruenerator/shared/hooks';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { colors, spacing, borderRadius } from '../../theme';
import { routeWithParams } from '../../types/routes';
import { agentIcon } from '../chat/sidebarIcons';

import type { Theme } from '../../theme/colors';

/**
 * Landesverband agents for a notebook — a minimal, collapsible list (toggle, like
 * "Mehr anzeigen") of icon · name rows. LV agents pin themselves to their notebook
 * via `defaultNotebookIds`. Self-hides entirely when none match. Tapping an agent
 * opens a chat with it.
 */
export function NotebookAgentsSection({
  notebookId,
  theme,
  onGreen,
}: {
  notebookId: string;
  theme: Theme;
  onGreen?: boolean;
}) {
  const router = useRouter();
  const { locale } = useAuth();
  const [open, setOpen] = useState(false);
  const accent = onGreen ? colors.white : theme.textGreen;

  const agents = useMemo(
    () =>
      getVisibleSystemAgentsForLocale(locale).filter((a) =>
        a.defaultNotebookIds?.includes(notebookId)
      ),
    [locale, notebookId]
  );

  const handleSelect = useCallback(
    (agent: Agent) => {
      router.push(
        routeWithParams('/(focused)/chat-conversation', {
          threadId: 'new',
          agentId: agent.identifier,
        })
      );
    },
    [router]
  );

  if (agents.length === 0) return null;

  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={styles.toggle}
        hitSlop={6}
        accessibilityRole="button"
      >
        <Text style={[styles.toggleText, { color: accent }]}>
          {open ? 'Agent*innen ausblenden' : 'Agent*innen'}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={accent} />
      </Pressable>

      {open && (
        <View style={styles.list}>
          {agents.map((agent) => (
            <Pressable
              key={agent.identifier}
              onPress={() => handleSelect(agent)}
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
            >
              <View style={[styles.iconCircle, { backgroundColor: theme.surface }]}>
                <Ionicons name={agentIcon(agent.iconKey)} size={20} color={theme.textGreen} />
              </View>
              <Text
                style={[styles.name, { color: onGreen ? colors.white : theme.text }]}
                numberOfLines={1}
              >
                {agent.title}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={onGreen ? 'rgba(255,255,255,0.7)' : theme.textSecondary}
              />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.xsmall,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xxsmall,
    paddingVertical: spacing.xsmall,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    gap: spacing.xsmall,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
    paddingVertical: spacing.small,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
});
