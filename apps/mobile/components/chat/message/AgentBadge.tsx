import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { spacing, borderRadius, chatType } from '../../../theme';

import type { MessageAgent } from './messageAgent';
import type { Theme } from '../../../theme/colors';

/**
 * Names the Grünerator that wrote this answer.
 *
 * Web pairs this with a per-message avatar column to the left of the text.
 * Mobile shows only the chip: the ChatGPT-shaped layout deliberately dropped
 * per-message chrome, and an avatar column would re-indent every assistant
 * message by ~40dp on a screen that has none to spare. The chip carries the
 * same information at the point where it is needed — before reading the answer.
 */
export const AgentBadge = memo(function AgentBadge({
  agent,
  theme,
}: {
  agent: MessageAgent;
  theme: Theme;
}) {
  return (
    <View
      style={[styles.badge, { backgroundColor: theme.surface }]}
      accessibilityLabel={`Antwort von ${agent.title}`}
    >
      <View style={[styles.disc, { backgroundColor: agent.backgroundColor }]}>
        <Text style={styles.avatar}>{agent.avatar}</Text>
      </View>
      <Text style={[styles.title, { color: theme.textSecondary }]} numberOfLines={1}>
        {agent.title}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    borderRadius: borderRadius.pill,
    paddingLeft: 3,
    paddingRight: spacing.xsmall,
    paddingVertical: 3,
    marginBottom: spacing.xxsmall,
  },
  disc: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    fontSize: 10,
    lineHeight: 14,
  },
  title: {
    ...chatType.chatLabel,
    fontWeight: '600',
  },
});
