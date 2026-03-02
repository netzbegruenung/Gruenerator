import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useCallback, useState, useRef } from 'react';
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

import { ThreadListItem } from '../../../components/chat';
import { configureMobileChat, getMobileChatApiClient } from '../../../services/chatConfig';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../../theme';

interface Thread {
  id: string;
  userId: string;
  agentId: string;
  title: string | null;
  status?: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: { content: string; role: string; created_at: string } | null;
}

const SUGGESTIONS = [
  'Was steht im Grundsatzprogramm zum Klimaschutz?',
  'Fasse die Position der Grünen zur Energiewende zusammen',
  'Schreibe einen Social-Media-Post zum Thema Mobilität',
];

export default function ThreadListScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const configuredRef = useRef(false);

  if (!configuredRef.current) {
    configureMobileChat();
    configuredRef.current = true;
  }

  const loadThreads = useCallback(async () => {
    setIsLoading(true);
    try {
      const apiClient = getMobileChatApiClient();
      const result = await apiClient.get<Thread[]>('/api/chat-service/threads');
      setThreads(result);
    } catch (error) {
      console.warn('[ThreadList] Failed to load threads:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const handleNewChat = useCallback(() => {
    router.push('/(focused)/chat-conversation?threadId=new' as any);
  }, [router]);

  const handleThreadPress = useCallback(
    (threadId: string) => {
      router.push(`/(focused)/chat-conversation?threadId=${threadId}` as any);
    },
    [router]
  );

  const handleDeleteThread = useCallback((threadId: string, title: string | null) => {
    Alert.alert('Unterhaltung löschen', `"${title || 'Neue Unterhaltung'}" wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          try {
            const apiClient = getMobileChatApiClient();
            await apiClient.delete(`/api/chat-service/threads?threadId=${threadId}`);
            setThreads((prev) => prev.filter((t) => t.id !== threadId));
          } catch (error) {
            console.warn('[ThreadList] Failed to delete thread:', error);
          }
        },
      },
    ]);
  }, []);

  const handleSuggestion = useCallback(
    (text: string) => {
      router.push({
        pathname: '/(focused)/chat-conversation' as any,
        params: { threadId: 'new', initialMessage: text },
      });
    },
    [router]
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
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
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
