import { useActionSheet } from '@expo/react-native-action-sheet';
import {
  useProjectsStore,
  formatDuration,
  formatDate,
  type Project,
  getThumbnailUrl,
} from '@gruenerator/shared';
import { useAuthStore } from '@gruenerator/shared/stores';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Pressable,
  useWindowDimensions,
  StyleSheet,
  useColorScheme,
  Alert,
  RefreshControl,
} from 'react-native';

import { secureStorage } from '../../services/storage';
import { colors, spacing, lightTheme, darkTheme, BODY_FONT } from '../../theme';
import { CONTENT_MAX_WIDTH } from '../../theme/layout';
import { SkeletonBar, SkeletonGroup } from '../common/Skeleton';

interface ProjectListProps {
  onSelectProject: (project: Project) => void;
  onEditProject?: (project: Project) => void;
  onShareProject?: (project: Project) => void;
  onNewReel: () => void;
  /** Shown instead of the list while there are no reels — the uploader. */
  empty: ReactNode;
}

const COLUMNS = 2;
const GAP = spacing.small;

export function ProjectList({
  onSelectProject,
  onEditProject,
  onShareProject,
  onNewReel,
  empty,
}: ProjectListProps) {
  const { width: windowWidth } = useWindowDimensions();
  const tileWidth = Math.floor(
    (Math.min(windowWidth, CONTENT_MAX_WIDTH) - spacing.large * 2 - GAP * (COLUMNS - 1)) / COLUMNS
  );
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { showActionSheetWithOptions } = useActionSheet();
  const [refreshing, setRefreshing] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    void secureStorage.getToken().then(setAuthToken);
  }, []);
  const {
    projects,
    isLoading,
    error,
    initialFetchComplete,
    fetchProjects,
    deleteProject,
    clearError,
  } = useProjectsStore();

  useEffect(() => {
    if (isAuthenticated && !initialFetchComplete) {
      void fetchProjects();
    }
  }, [isAuthenticated, initialFetchComplete, fetchProjects]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProjects();
    setRefreshing(false);
  }, [fetchProjects]);

  const confirmDelete = useCallback(
    (project: Project) => {
      Alert.alert('Projekt löschen', `Möchtest du "${project.title}" wirklich löschen?`, [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProject(project.id);
            } catch (err) {
              Alert.alert('Fehler', 'Projekt konnte nicht gelöscht werden');
            }
          },
        },
      ]);
    },
    [deleteProject]
  );

  const showProjectOptions = useCallback(
    (project: Project) => {
      const options = ['Bearbeiten', 'Teilen', 'Löschen', 'Abbrechen'];
      const destructiveButtonIndex = 2;
      const cancelButtonIndex = 3;

      showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
          destructiveButtonIndex,
          title: project.title,
        },
        (selectedIndex) => {
          switch (selectedIndex) {
            case 0:
              if (onEditProject) {
                onEditProject(project);
              } else {
                onSelectProject(project);
              }
              break;
            case 1:
              onShareProject?.(project);
              break;
            case 2:
              confirmDelete(project);
              break;
            case undefined:
            default:
              break;
          }
        }
      );
    },
    [showActionSheetWithOptions, onSelectProject, onEditProject, onShareProject, confirmDelete]
  );

  // A reel is a 9:16 video, so its tile is one: the picture is the point,
  // title and date are read out to screen readers only.
  const renderProject = useCallback(
    ({ item }: { item: Project }) => {
      const thumbnailUrl = item.thumbnail_path ? getThumbnailUrl(item.id) : null;
      const duration = item.video_metadata?.duration;

      return (
        <Pressable
          style={({ pressed }) => [
            styles.tile,
            { width: tileWidth, backgroundColor: theme.border },
            pressed && styles.pressed,
          ]}
          onPress={() => onSelectProject(item)}
          onLongPress={() => showProjectOptions(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}, ${formatDate(item.last_edited_at)}`}
          accessibilityHint="Gedrückt halten für Optionen"
        >
          {thumbnailUrl && authToken ? (
            <Image
              source={{
                uri: thumbnailUrl,
                headers: { Authorization: `Bearer ${authToken}` },
              }}
              style={styles.fill}
              contentFit="cover"
              recyclingKey={item.id}
            />
          ) : (
            <View style={styles.thumbnailPlaceholder}>
              <Ionicons name="videocam" size={32} color={theme.textSecondary} />
            </View>
          )}
          {duration ? (
            <View style={styles.durationBadge}>
              <Ionicons name="play" size={10} color={colors.white} />
              <Text style={styles.durationText}>{formatDuration(duration)}</Text>
            </View>
          ) : null}
          <Pressable
            style={styles.moreButton}
            onPress={() => showProjectOptions(item)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Optionen für ${item.title}`}
          >
            <Ionicons name="ellipsis-horizontal" size={16} color={colors.white} />
          </Pressable>
        </Pressable>
      );
    },
    [theme, tileWidth, onSelectProject, showProjectOptions, authToken]
  );

  const loading = isLoading && !initialFetchComplete;

  const renderSkeleton = () => (
    <SkeletonGroup style={styles.skeletonGrid}>
      {[0, 1, 2, 3].map((i) => (
        <SkeletonBar key={i} width={tileWidth} height={(tileWidth * 16) / 9} radius={16} />
      ))}
    </SkeletonGroup>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={[styles.headerTitle, { color: theme.text }]}>Meine Reels</Text>
      <TouchableOpacity
        style={[styles.newButton, { backgroundColor: colors.secondary[600] }]}
        onPress={onNewReel}
        accessibilityRole="button"
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.newButtonText}>Neu</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFooter = () => {
    if (projects.length === 0) return null;

    return (
      <Text style={[styles.footerText, { color: theme.textSecondary }]}>
        Max. 20 Projekte werden gespeichert
      </Text>
    );
  };

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error[500]} />
        <Text style={[styles.errorText, { color: theme.text }]}>{error}</Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary[600] }]}
          onPress={() => {
            clearError();
            void fetchProjects();
          }}
          accessibilityRole="button"
        >
          <Text style={styles.retryButtonText}>Erneut versuchen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // No reels yet: the uploader is the whole screen, one tap from a first reel.
  if (!loading && projects.length === 0) return <>{empty}</>;

  return (
    <View style={styles.container}>
      {renderHeader()}
      <FlatList
        data={loading ? [] : projects}
        renderItem={renderProject}
        keyExtractor={(item) => item.id}
        numColumns={COLUMNS}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={loading ? renderSkeleton : null}
        ListFooterComponent={renderFooter}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary[600]}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
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
    paddingHorizontal: spacing.large,
    paddingVertical: spacing.medium,
  },
  headerTitle: {
    fontFamily: BODY_FONT,
    fontSize: 24,
    fontWeight: '700',
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingHorizontal: spacing.medium,
    borderRadius: 999,
    gap: 4,
  },
  newButtonText: {
    color: '#fff',
    fontFamily: BODY_FONT,
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: spacing.large,
    paddingBottom: spacing.large,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  row: { gap: GAP },
  tile: {
    aspectRatio: 9 / 16,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: GAP,
  },
  pressed: { opacity: 0.8 },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  thumbnailPlaceholder: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  durationText: {
    color: '#fff',
    fontFamily: BODY_FONT,
    fontSize: 11,
    fontWeight: '700',
  },
  moreButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: spacing.medium,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xlarge,
    gap: spacing.medium,
  },
  errorText: {
    fontFamily: BODY_FONT,
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: spacing.large,
    paddingVertical: spacing.medium,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontFamily: BODY_FONT,
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ProjectList;
