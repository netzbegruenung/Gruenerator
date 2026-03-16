import { Ionicons } from '@expo/vector-icons';
import { getGlobalApiClient } from '@gruenerator/shared/api';
import { useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  useColorScheme,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  Linking,
} from 'react-native';

import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../../theme';

interface Board {
  id: string;
  title: string;
  created_by: string;
  creator_name?: string;
  created_at: string;
  updated_at: string;
  content?: string | { is_archived?: boolean; board_type?: string };
}

const BOARDS_URL = 'https://gruenerator.eu/boards';

const dateFormat: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };

function getBoardType(board: Board): string {
  const content = typeof board.content === 'string' ? JSON.parse(board.content) : board.content;
  return content?.board_type ?? 'kanban';
}

export default function BoardsScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [boards, setBoards] = useState<Board[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBoards = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);

    try {
      const apiClient = getGlobalApiClient();
      const response = await apiClient.get('/boards');
      const all: Board[] = response.data || [];
      const active = all.filter((b) => {
        const content = typeof b.content === 'string' ? JSON.parse(b.content) : b.content;
        return !content?.is_archived;
      });
      setBoards(active);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Boards konnten nicht geladen werden');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchBoards();
    }, [fetchBoards])
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchBoards(true);
  }, [fetchBoards]);

  const openBoard = useCallback((id: string) => {
    Linking.openURL(`${BOARDS_URL}/${id}`);
  }, []);

  const renderBoard = useCallback(
    ({ item }: { item: Board }) => {
      const boardType = getBoardType(item);
      const isWhiteboard = boardType === 'whiteboard';

      return (
        <Pressable
          onPress={() => openBoard(item.id)}
          style={({ pressed }) => [
            styles.boardCard,
            {
              backgroundColor: pressed ? theme.surface : theme.card,
              borderColor: theme.cardBorder,
            },
          ]}
        >
          <Ionicons
            name={isWhiteboard ? 'pencil-outline' : 'grid-outline'}
            size={24}
            color={colors.primary[600]}
          />
          <View style={styles.boardInfo}>
            <Text style={[styles.boardTitle, { color: theme.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={styles.boardMeta}>
              {item.creator_name && (
                <Text style={[styles.boardMetaText, { color: theme.textSecondary }]}>
                  {item.creator_name}
                </Text>
              )}
              {item.creator_name && (
                <Text style={[styles.boardMetaDot, { color: theme.textSecondary }]}>·</Text>
              )}
              <Text style={[styles.boardMetaText, { color: theme.textSecondary }]}>
                {new Date(item.updated_at).toLocaleDateString('de-DE', dateFormat)}
              </Text>
              <View
                style={[
                  styles.typeBadge,
                  { backgroundColor: isWhiteboard ? colors.secondary[100] : colors.primary[100] },
                ]}
              >
                <Text
                  style={[
                    styles.typeBadgeText,
                    { color: isWhiteboard ? colors.secondary[700] : colors.primary[700] },
                  ]}
                >
                  {isWhiteboard ? 'Whiteboard' : 'Kanban'}
                </Text>
              </View>
            </View>
          </View>
          <Ionicons name="open-outline" size={16} color={theme.textSecondary} />
        </Pressable>
      );
    },
    [theme, openBoard]
  );

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Boards laden...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle" size={48} color={colors.semantic.error} />
        <Text style={[styles.errorText, { color: colors.semantic.error }]}>{error}</Text>
        <Pressable
          onPress={() => fetchBoards()}
          style={({ pressed }) => [
            styles.retryButton,
            { backgroundColor: pressed ? colors.primary[700] : colors.primary[600] },
          ]}
        >
          <Text style={styles.retryButtonText}>Erneut versuchen</Text>
        </Pressable>
      </View>
    );
  }

  if (boards.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Ionicons name="grid-outline" size={48} color={theme.textSecondary} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>Keine Boards</Text>
        <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
          Erstelle ein Board auf gruenerator.eu{'\n'}um Aufgaben zu organisieren.
        </Text>
        <Pressable
          onPress={() => Linking.openURL(BOARDS_URL)}
          style={({ pressed }) => [
            styles.openWebButton,
            { backgroundColor: pressed ? colors.primary[700] : colors.primary[600] },
          ]}
        >
          <Ionicons name="open-outline" size={16} color={colors.white} />
          <Text style={styles.openWebButtonText}>Im Browser öffnen</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={boards}
      keyExtractor={(item) => item.id}
      renderItem={renderBoard}
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: spacing.medium, paddingBottom: spacing.xxlarge, gap: spacing.small },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xlarge,
    gap: spacing.medium,
  },
  loadingText: { ...typography.body },
  errorText: { ...typography.body, textAlign: 'center' },
  retryButton: {
    paddingHorizontal: spacing.large,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
  },
  retryButtonText: { ...typography.body, fontWeight: '600', color: colors.white },
  emptyTitle: { ...typography.h2, textAlign: 'center' },
  emptySubtitle: { ...typography.body, textAlign: 'center' },
  openWebButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.large,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
  },
  openWebButtonText: { ...typography.body, fontWeight: '600', color: colors.white },
  boardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
    padding: spacing.medium,
    borderRadius: borderRadius.large,
    borderWidth: 1,
  },
  boardInfo: { flex: 1, gap: 2 },
  boardTitle: { ...typography.bodyBold },
  boardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  boardMetaText: { fontSize: 12 },
  boardMetaDot: { fontSize: 12 },
  typeBadge: {
    paddingHorizontal: spacing.xsmall,
    paddingVertical: 1,
    borderRadius: borderRadius.small,
    marginLeft: 2,
  },
  typeBadgeText: { fontSize: 10, fontWeight: '600' },
});
