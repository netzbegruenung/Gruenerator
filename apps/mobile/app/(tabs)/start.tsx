import { Ionicons } from '@expo/vector-icons';
import { getGlobalApiClient } from '@gruenerator/shared/api';
import { useAuth } from '@gruenerator/shared/hooks';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  Pressable,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatSettingsSheet } from '../../components/chat/ChatSettingsSheet';
import { ComposerCard, ProfileAvatar } from '../../components/common';
import { useUnreadCount } from '../../hooks/useNotifications';
import { useRecentThreads } from '../../hooks/useRecentThreads';
import { colors, spacing, lightTheme, darkTheme, borderRadius } from '../../theme';
import { routeWithParams, type AppRoute } from '../../types/routes';

const EXAMPLE_PROMPTS = [
  { label: 'Pressemitteilung', text: 'Schreibe eine Pressemitteilung über ' },
  { label: 'Antrag', text: 'Erstelle einen Antrag zum Thema ' },
  { label: 'Instagram-Post', text: 'Schreibe einen Instagram-Post zum Thema ' },
  { label: 'Rede', text: 'Schreibe eine Rede über ' },
];

interface Board {
  id: string;
  title: string;
  creator_name?: string;
  updated_at: string;
  content?: string | { is_archived?: boolean; board_type?: string };
}

const BOARDS_URL = 'https://gruenerator.eu/boards';
const dateFormat: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };

function getBoardType(board: Board): string {
  const content = typeof board.content === 'string' ? JSON.parse(board.content) : board.content;
  return content?.board_type ?? 'kanban';
}

interface ToolDef {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: AppRoute;
}

const TOOLS: ToolDef[] = [
  {
    id: 'medien',
    title: 'Medien',
    description: 'Reels & Bilder',
    icon: 'videocam',
    route: '/(tabs)/(media)',
  },
  {
    id: 'scanner',
    title: 'Scanner',
    description: 'Dokumente digitalisieren',
    icon: 'scan',
    route: '/(tabs)/(desk)/scanner',
  },
  {
    id: 'transkription',
    title: 'Transkription',
    description: 'Audio transkribieren',
    icon: 'mic',
    route: '/(tabs)/(desk)/transkription',
  },
  {
    id: 'gruppen',
    title: 'Gruppen',
    description: 'Teams verwalten',
    icon: 'people',
    route: '/(tabs)/(desk)/gruppen',
  },
  {
    id: 'recherche',
    title: 'Recherche',
    description: 'Notebooks & Suche',
    icon: 'search',
    route: '/(tabs)/(recherche)',
  },
  {
    id: 'websuche',
    title: 'Websuche',
    description: 'KI-Suche im Web',
    icon: 'globe',
    route: '/(tabs)/(recherche)/suche',
  },
];

export default function StartScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const { user } = useAuth();
  const firstName = user?.display_name?.split(' ')[0] || 'Grüner';
  const { count: unreadCount } = useUnreadCount();
  const { threads: recentThreads } = useRecentThreads(5);

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(true);

  const fetchBoards = useCallback(async () => {
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
      setBoardsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchBoards();
    }, [fetchBoards])
  );

  const handleSend = useCallback(
    (text: string) => {
      router.push(
        routeWithParams('/(focused)/chat-conversation', {
          threadId: 'new',
          initialMessage: text,
        })
      );
    },
    [router]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={
          colorScheme === 'dark'
            ? [colors.grey[950], colors.grey[950]]
            : [colors.secondary[50], colors.white]
        }
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.4 }}
      />
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Grünerator</Text>
        <Pressable
          onPress={() => router.push('/(fullscreen)/notifications' as Href)}
          onLongPress={() => router.push('/profile')}
          style={styles.profileButton}
        >
          <ProfileAvatar
            avatarRobotId={user?.avatar_robot_id}
            displayName={user?.display_name}
            email={user?.email}
            size="small"
          />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.welcomeSection}>
          <Text style={[styles.welcomeText, { color: theme.text }]}>
            Hallo {firstName},
          </Text>
          <Text style={[styles.welcomeSubtitle, { color: theme.textSecondary }]}>
            wie kann ich dir helfen?
          </Text>
        </View>

        <View style={styles.inputSection}>
          <ComposerCard
            placeholder="Stelle eine Frage oder gib eine Aufgabe..."
            onSend={handleSend}
            onSettings={() => setSettingsVisible(true)}
          />
          <Text style={[styles.inputHint, { color: theme.textSecondary }]}>
            z.B. „{EXAMPLE_PROMPTS[0].label}" oder „{EXAMPLE_PROMPTS[1].label}"
          </Text>

          {recentThreads.length > 0 && (
            <View style={styles.threadSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.threadChips}
              >
                {recentThreads.map((thread) => (
                  <Pressable
                    key={thread.id}
                    onPress={() =>
                      router.push(
                        routeWithParams('/(focused)/chat-conversation', {
                          threadId: thread.id,
                        })
                      )
                    }
                    style={({ pressed }) => [
                      styles.threadChip,
                      {
                        borderColor: colorScheme === 'dark' ? colors.grey[600] : colors.grey[300],
                        backgroundColor: pressed
                          ? (colorScheme === 'dark' ? colors.grey[700] : colors.grey[100])
                          : (colorScheme === 'dark' ? colors.grey[800] : colors.white),
                      },
                    ]}
                  >
                    <Ionicons name="chatbubble-outline" size={12} color={theme.textSecondary} />
                    <Text style={[styles.threadChipText, { color: theme.text }]} numberOfLines={1}>
                      {thread.title || 'Neue Unterhaltung'}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => router.push('/(fullscreen)/all-threads' as Href)}
                  style={[styles.threadChip, { borderColor: colorScheme === 'dark' ? colors.grey[700] : colors.grey[300] }]}
                >
                  <Text style={{ fontSize: 12, color: colors.primary[600], fontWeight: '500' }}>
                    Alle ›
                  </Text>
                </Pressable>
              </ScrollView>
            </View>
          )}
        </View>

        {/* Boards — only shown when boards exist */}
        {!boardsLoading && boards.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Boards</Text>
            <Pressable onPress={() => Linking.openURL(BOARDS_URL)} hitSlop={8}>
              <Ionicons name="open-outline" size={16} color={theme.textSecondary} />
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
                        size={18}
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
                    <Text style={[styles.boardTitle, { color: theme.text }]} numberOfLines={2}>
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

        {/* Tools */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Werkzeuge</Text>
          <View style={styles.toolGrid}>
            {TOOLS.map((tool) => (
              <Pressable
                key={tool.id}
                onPress={() => router.push(tool.route as Href)}
                style={({ pressed }) => [
                  styles.toolItem,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <View
                  style={[
                    styles.toolCircle,
                    { backgroundColor: colors.primary[600] },
                  ]}
                >
                  <Ionicons name={tool.icon} size={22} color={colors.white} />
                </View>
                <Text style={[styles.toolLabel, { color: theme.text }]} numberOfLines={1}>
                  {tool.title}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
      <ChatSettingsSheet visible={settingsVisible} onDismiss={() => setSettingsVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  profileButton: {
    padding: spacing.xsmall,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: colors.error[500],
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: 'white',
    fontSize: 9,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxlarge,
  },
  welcomeSection: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.xlarge,
    paddingBottom: spacing.small,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: '700',
  },
  welcomeSubtitle: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 2,
  },
  inputSection: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.medium,
  },
  inputHint: {
    fontSize: 12,
    marginTop: spacing.xsmall,
  },
  threadSection: {
    marginTop: spacing.small,
  },
  section: {
    paddingTop: spacing.xlarge,
    paddingHorizontal: spacing.medium,
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
    paddingVertical: spacing.large,
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
    fontSize: 14,
    fontWeight: '600',
  },
  boardMeta: {
    fontSize: 11,
  },
  threadChips: {
    gap: spacing.xsmall,
  },
  threadChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall + 2,
    maxWidth: 180,
  },
  threadChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  toolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
  },
  toolItem: {
    width: '33%',
    alignItems: 'center',
    paddingVertical: spacing.small,
  },
  toolCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxsmall,
  },
  toolLabel: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});
