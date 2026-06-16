import { getVisibleSystemAgentsForLocale, type Agent } from '@gruenerator/shared/agents';
import { useAuth } from '@gruenerator/shared/hooks';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { spacing } from '../../theme';
import { routeWithParams } from '../../types/routes';
import { AgentCardList } from '../agents/AgentCardList';

import type { Theme } from '../../theme/colors';

/**
 * Landesverband agents for a notebook — mobile port of web's `NotebookAgentsSection`.
 * LV agents pin themselves to their notebook via `defaultNotebookId`, so the
 * notebook's own agents are exactly the system agents whose `defaultNotebookId`
 * matches. Matching on the notebook id (not the identifier) also covers the Austria
 * suffix quirk. Self-hides when nothing matches — user notebooks (UUID id) and Bundes
 * notebooks without agents render nothing. Tapping an agent opens a chat with it
 * (same target as the agents browse screen).
 */
export function NotebookAgentsSection({
  notebookId,
  theme,
  title = 'Agent*innen für diesen Landesverband',
}: {
  notebookId: string;
  theme: Theme;
  title?: string;
}) {
  const router = useRouter();
  const { locale } = useAuth();

  const agents = useMemo(
    () => getVisibleSystemAgentsForLocale(locale).filter((a) => a.defaultNotebookId === notebookId),
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
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <AgentCardList agents={agents} onSelect={handleSelect} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.small,
  },
  title: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 16,
  },
});
