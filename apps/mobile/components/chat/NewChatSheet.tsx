import { Ionicons } from '@expo/vector-icons';
import {
  notebookMentionables,
  agentMentionables,
  toolMentionables,
  type Mentionable,
} from '@gruenerator/chat';
import { View, Text, Pressable, ScrollView, StyleSheet, useColorScheme } from 'react-native';

import { BottomSheet } from '../common/BottomSheet';
import { colors, spacing, lightTheme, darkTheme } from '../../theme';

interface NewChatSheetProps {
  visible: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelectNotebook: (notebookId: string) => void;
  onSelectAgent?: (agentId: string) => void;
  onInsertMention?: (mentionable: Mentionable) => void;
}

const notebooks = notebookMentionables.filter((m) => m.identifier !== 'gruenerator-notebook');
const agents = agentMentionables;
const tools = toolMentionables;

export function NewChatSheet({
  visible,
  onClose,
  onNewChat,
  onSelectNotebook,
  onSelectAgent,
  onInsertMention,
}: NewChatSheetProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="70%">

        <Pressable
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: pressed ? theme.surface : 'transparent' },
          ]}
          onPress={() => {
            onClose();
            onNewChat();
          }}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.primary[600] }]}>
            <Ionicons name="chatbubble-ellipses" size={22} color={colors.white} />
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Neuer Chat</Text>
            <Text style={[styles.rowDescription, { color: theme.textSecondary }]}>
              Freie Unterhaltung mit dem Grünerator
            </Text>
          </View>
        </Pressable>

        <View style={[styles.separator, { backgroundColor: theme.border }]} />

        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {onSelectAgent && (
            <>
              <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>
                Assistenten
              </Text>
              {agents.map((agent) => (
                <Pressable
                  key={agent.identifier}
                  style={({ pressed }) => [
                    styles.row,
                    { backgroundColor: pressed ? theme.surface : 'transparent' },
                  ]}
                  onPress={() => {
                    onClose();
                    onSelectAgent(agent.identifier);
                  }}
                >
                  <View style={[styles.iconCircle, { backgroundColor: agent.backgroundColor }]}>
                    <Text style={styles.emoji}>{agent.avatar}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>{agent.title}</Text>
                    <Text
                      style={[styles.rowDescription, { color: theme.textSecondary }]}
                      numberOfLines={1}
                    >
                      /{agent.mention}
                    </Text>
                  </View>
                </Pressable>
              ))}
              <View style={[styles.separator, { backgroundColor: theme.border }]} />
            </>
          )}

          {onInsertMention && (
            <>
              <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Werkzeuge</Text>
              {tools.map((tool) => (
                <Pressable
                  key={tool.identifier}
                  style={({ pressed }) => [
                    styles.row,
                    { backgroundColor: pressed ? theme.surface : 'transparent' },
                  ]}
                  onPress={() => {
                    onClose();
                    onInsertMention(tool);
                  }}
                >
                  <View style={[styles.iconCircle, { backgroundColor: tool.backgroundColor }]}>
                    <Text style={styles.emoji}>{tool.avatar}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>{tool.title}</Text>
                    <Text
                      style={[styles.rowDescription, { color: theme.textSecondary }]}
                      numberOfLines={1}
                    >
                      @{tool.mention}
                    </Text>
                  </View>
                </Pressable>
              ))}
              <View style={[styles.separator, { backgroundColor: theme.border }]} />
            </>
          )}

          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Quellen</Text>
          {notebooks.map((nb) => (
            <Pressable
              key={nb.identifier}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? theme.surface : 'transparent' },
              ]}
              onPress={() => {
                onClose();
                onSelectNotebook(nb.identifier);
              }}
            >
              <View style={[styles.iconCircle, { backgroundColor: nb.backgroundColor }]}>
                <Text style={styles.emoji}>{nb.avatar}</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: theme.text }]}>{nb.title}</Text>
                <Text
                  style={[styles.rowDescription, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {nb.description}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    gap: spacing.medium,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 22,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowDescription: {
    fontSize: 13,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.medium,
    marginVertical: spacing.small,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.medium,
    marginBottom: spacing.xsmall,
  },
  list: {
    flexShrink: 1,
  },
});
