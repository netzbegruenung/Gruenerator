import {
  ThreadListPrimitive,
  ThreadListItemPrimitive,
  ThreadListItemByIndexProvider,
  useAui,
} from '@assistant-ui/react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAgentStore, type Mentionable } from '@gruenerator/chat';
import { type ReactElement, memo, useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, borderRadius } from '../../theme';

import { NewChatSheet } from './NewChatSheet';

import type { Theme } from '../../theme/colors';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';

interface Props extends DrawerContentComponentProps {
  theme?: Theme;
}

const ThreadItem = memo(function ThreadItem({
  index,
  theme,
  onSelect,
}: {
  index: number;
  theme: Theme;
  onSelect: () => void;
}) {
  const aui = useAui();

  const handlePress = useCallback(() => {
    aui.threadListItem().switchTo();
    onSelect();
  }, [aui, onSelect]);

  const handleDelete = useCallback(() => {
    const title = aui.threadListItem().getState().title;
    Alert.alert('Unterhaltung löschen', `"${title || 'Neue Unterhaltung'}" wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => aui.threadListItem().delete(),
      },
    ]);
  }, [aui]);

  return (
    <ThreadListItemByIndexProvider index={index} archived={false}>
      <ThreadListItemPrimitive.Root style={styles.itemRoot}>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.itemTrigger,
            { backgroundColor: pressed ? theme.surface : 'transparent' },
          ]}
        >
          <Ionicons name="chatbubble-outline" size={18} color={theme.textSecondary} />
          <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
            <ThreadListItemPrimitive.Title fallback="Neue Unterhaltung" />
          </Text>
        </Pressable>

        <Pressable onPress={handleDelete} style={styles.deleteButton} hitSlop={8}>
          <Ionicons name="trash-outline" size={16} color={theme.textSecondary} />
        </Pressable>
      </ThreadListItemPrimitive.Root>
    </ThreadListItemByIndexProvider>
  );
});

export const ThreadListDrawer = memo(function ThreadListDrawer({
  navigation,
  theme: themeProp,
}: Props) {
  const resolvedTheme = useTheme();
  const theme = themeProp ?? resolvedTheme;
  const insets = useSafeAreaInsets();
  const [sheetVisible, setSheetVisible] = useState(false);
  const aui = useAui();

  const closeDrawer = useCallback(() => {
    navigation.closeDrawer();
  }, [navigation]);

  const handleNewChat = useCallback(() => {
    setSheetVisible(false);
    aui.threads().switchToNewThread();
    navigation.closeDrawer();
  }, [aui, navigation]);

  const handleSelectNotebook = useCallback(
    (notebookId: string) => {
      setSheetVisible(false);
      useAgentStore.getState().setSelectedNotebook(notebookId);
      aui.threads().switchToNewThread();
      navigation.closeDrawer();
    },
    [aui, navigation]
  );

  const handleSelectAgent = useCallback(
    (agentId: string) => {
      setSheetVisible(false);
      useAgentStore.getState().setSelectedAgent(agentId);
      aui.threads().switchToNewThread();
      navigation.closeDrawer();
    },
    [aui, navigation]
  );

  const handleInsertMention = useCallback(
    (mentionable: Mentionable) => {
      setSheetVisible(false);
      const trigger = mentionable.category === 'skill' ? '/' : '@';
      const text = `${trigger}${mentionable.mention} `;
      aui.composer().setText(text);
      aui.threads().switchToNewThread();
      navigation.closeDrawer();
    },
    [aui, navigation]
  );

  const renderItem = useCallback(
    ({ index }: { threadId: string; index: number }): ReactElement => (
      <ThreadItem index={index} theme={theme} onSelect={closeDrawer} />
    ),
    [theme, closeDrawer]
  );

  return (
    <ThreadListPrimitive.Root style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.small }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Unterhaltungen</Text>
        <ThreadListPrimitive.New style={styles.newButton}>
          <Ionicons name="create-outline" size={22} color={colors.primary[600]} />
        </ThreadListPrimitive.New>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.sourceRow,
          {
            backgroundColor: pressed ? theme.surface : 'transparent',
            borderColor: theme.border,
          },
        ]}
        onPress={() => setSheetVisible(true)}
      >
        <Ionicons name="library-outline" size={18} color={colors.primary[600]} />
        <Text style={[styles.sourceText, { color: theme.text }]}>Neuer Chat mit Quelle…</Text>
      </Pressable>

      <View style={[styles.separator, { backgroundColor: theme.border }]} />

      <ThreadListPrimitive.Items
        renderItem={renderItem}
        style={styles.list}
        contentContainerStyle={styles.listContent}
      />

      <NewChatSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onNewChat={handleNewChat}
        onSelectNotebook={handleSelectNotebook}
        onSelectAgent={handleSelectAgent}
        onInsertMention={handleInsertMention}
      />
    </ThreadListPrimitive.Root>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.small,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  newButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    marginHorizontal: spacing.small,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sourceText: {
    fontSize: 14,
    fontWeight: '500',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.medium,
    marginVertical: spacing.small,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.xsmall,
  },
  itemRoot: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemTrigger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
  },
  itemTitle: {
    flex: 1,
    fontSize: 14,
  },
  deleteButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
