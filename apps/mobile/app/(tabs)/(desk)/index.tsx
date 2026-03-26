import { Ionicons } from '@expo/vector-icons';
import { getGlobalApiClient } from '@gruenerator/shared/api';
import { useFocusEffect, useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
  Pressable,
  RefreshControl,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

const TOOLS: Array<{
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}> = [
  {
    id: 'scanner',
    title: 'Scanner',
    description: 'Dokumente digitalisieren',
    icon: 'scan-outline',
    route: '/(tabs)/(desk)/scanner',
  },
  {
    id: 'transkription',
    title: 'Transkription',
    description: 'Audio transkribieren',
    icon: 'mic-outline',
    route: '/(tabs)/(desk)/transkription',
  },
  {
    id: 'gruppen',
    title: 'Gruppen',
    description: 'Teams verwalten',
    icon: 'people-outline',
    route: '/(tabs)/(desk)/gruppen',
  },
];

export default function DeskDashboard() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();

  const [boards, setBoards] = useState<Board[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchBoards = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const apiClient = getGlobalApiClient();
      const response = await apiClient.get('/boards');
      const all: Board[] = response.data || [];
      const active = all.filter((b) => {
        const content = typeof b.content === 'string' ? JSON.parse(b.content) : b.content;
        return !content?.is_archived;
      });
      setBoards(active);
    } catch {
      setBoards([]);
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <Text style={[styles.pageTitle, { color: theme.text }]}>Desk</Text>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      >
        {/* Boards Section — hidden when empty/loading */}
        {!isLoading && boards.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Boards</Text>
            <Pressable onPress={() => Linking.openURL(BOARDS_URL)}>
              <Ionicons name="open-outline" size={18} color={theme.textSecondary} />
            </Pressable>
          </View>

          {(
            <View style={styles.boardGrid}>
              {boards.map((board) => {
                const isWhiteboard = getBoardType(board) === 'whiteboard';
                return (
                  <Pressable
                    key={board.id}
                    onPress={() => Linking.openURL(`${BOARDS_URL}/${board.id}`)}
                    style={({ pressed }) => [
                      styles.boardCard,
                      {
                        backgroundColor: pressed ? theme.surface : theme.card,
                        borderColor: theme.cardBorder,
                      },
                    ]}
                  >
                    <View style={styles.boardCardHeader}>
                      <Ionicons
                        name={isWhiteboard ? 'pencil-outline' : 'grid-outline'}
                        size={20}
                        color={colors.primary[600]}
                      />
                      <View
                        style={[
                          styles.typeBadge,
                          {
                            backgroundColor: isWhiteboard
                              ? colors.secondary[100]
                              : colors.primary[100],
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeBadgeText,
                            {
                              color: isWhiteboard ? colors.secondary[700] : colors.primary[700],
                            },
                          ]}
                        >
                          {isWhiteboard ? 'Whiteboard' : 'Kanban'}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[styles.boardTitle, { color: theme.text }]}
                      numberOfLines={2}
                    >
                      {board.title}
                    </Text>
                    <Text style={[styles.boardMeta, { color: theme.textSecondary }]}>
                      {board.creator_name && `${board.creator_name} · `}
                      {new Date(board.updated_at).toLocaleDateString('de-DE', dateFormat)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
        )}

        {/* Tools Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Werkzeuge</Text>
          <View style={styles.toolGrid}>
            {TOOLS.map((tool) => (
              <Pressable
                key={tool.id}
                onPress={() => router.push(tool.route as any)}
                style={({ pressed }) => [
                  styles.toolCard,
                  {
                    backgroundColor: pressed ? theme.surface : theme.card,
                    borderColor: theme.cardBorder,
                  },
                ]}
              >
                <Ionicons name={tool.icon} size={24} color={colors.primary[600]} />
                <Text style={[styles.toolTitle, { color: theme.text }]}>{tool.title}</Text>
                <Text style={[styles.toolDesc, { color: theme.textSecondary }]}>
                  {tool.description}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  scrollContent: {
    padding: spacing.medium,
    paddingBottom: spacing.xxlarge,
    gap: spacing.large,
  },
  section: {
    gap: spacing.small,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  loadingRow: {
    paddingVertical: spacing.xlarge,
    alignItems: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
    padding: spacing.xlarge,
    borderRadius: borderRadius.large,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 13,
  },
  boardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.small,
  },
  boardCard: {
    width: '48%',
    flexGrow: 1,
    padding: spacing.medium,
    borderRadius: borderRadius.large,
    borderWidth: 1,
    gap: spacing.xxsmall,
  },
  boardCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxsmall,
  },
  typeBadge: {
    paddingHorizontal: spacing.xsmall,
    paddingVertical: 2,
    borderRadius: borderRadius.small,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  boardTitle: {
    ...typography.bodyBold,
    fontSize: 14,
  },
  boardMeta: {
    fontSize: 11,
  },
  toolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.small,
  },
  toolCard: {
    width: '48%',
    flexGrow: 1,
    padding: spacing.medium,
    borderRadius: borderRadius.large,
    borderWidth: 1,
    gap: spacing.xxsmall,
  },
  toolTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: spacing.xxsmall,
  },
  toolDesc: {
    fontSize: 12,
  },
});
