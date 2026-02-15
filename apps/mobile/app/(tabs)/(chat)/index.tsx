import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  useColorScheme,
  RefreshControl,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThreadListItem } from '../../../components/chat';
import { useDeepChatStore } from '../../../stores/deepChatStore';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../../theme';

const SUGGESTIONS = [
  'Was steht im Grundsatzprogramm zum Klimaschutz?',
  'Fasse die Position der Grünen zur Energiewende zusammen',
  'Schreibe einen Social-Media-Post zum Thema Mobilität',
];

export default function ThreadListScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { threads, isLoadingThreads, loadThreads, startNewChat, deleteThread, switchThread } =
    useDeepChatStore();

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const handleNewChat = useCallback(() => {
    startNewChat();
    router.push('/(tabs)/(chat)/new' as any);
  }, [startNewChat, router]);

  const handleThreadPress = useCallback(
    (threadId: string) => {
      switchThread(threadId);
      router.push(`/(tabs)/(chat)/${threadId}` as any);
    },
    [switchThread, router]
  );

  const handleDeleteThread = useCallback(
    (threadId: string, title: string | null) => {
      Alert.alert('Unterhaltung löschen', `"${title || 'Neue Unterhaltung'}" wirklich löschen?`, [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => deleteThread(threadId),
        },
      ]);
    },
    [deleteThread]
  );

  const handleSuggestion = useCallback(
    (text: string) => {
      startNewChat();
      router.push({ pathname: '/(tabs)/(chat)/new' as any, params: { initialMessage: text } });
    },
    [startNewChat, router]
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="chatbubble-ellipses-outline" size={64} color={theme.textSecondary} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>Keine Unterhaltungen</Text>
      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        Starte eine neue Unterhaltung mit dem Grünerator
      </Text>

      <View style={styles.suggestionsContainer}>
        {SUGGESTIONS.map((suggestion, index) => (
          <Pressable
            key={index}
            style={({ pressed }) => [
              styles.suggestionChip,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            onPress={() => handleSuggestion(suggestion)}
          >
            <Text style={[styles.suggestionText, { color: theme.text }]}>{suggestion}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={threads}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ThreadListItem
            thread={item}
            theme={theme}
            onPress={() => handleThreadPress(item.id)}
            onDelete={() => handleDeleteThread(item.id, item.title)}
          />
        )}
        ListEmptyComponent={!isLoadingThreads ? renderEmptyState : null}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingThreads}
            onRefresh={loadThreads}
            tintColor={colors.primary[600]}
          />
        }
        contentContainerStyle={threads.length === 0 ? styles.emptyListContainer : undefined}
      />

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: colors.primary[600],
            bottom: spacing.large,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        onPress={handleNewChat}
      >
        <Ionicons name="add" size={28} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyListContainer: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xlarge,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: spacing.medium,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xsmall,
    lineHeight: 20,
  },
  suggestionsContainer: {
    marginTop: spacing.xlarge,
    gap: spacing.small,
    width: '100%',
  },
  suggestionChip: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.large,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 14,
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    right: spacing.medium,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
