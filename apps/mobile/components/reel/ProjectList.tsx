import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { useProjectsStore, formatDuration, formatDate, type Project, getThumbnailUrl } from '@gruenerator/shared';
import { useAuthStore } from '@gruenerator/shared/stores';
import { colors, spacing, lightTheme, darkTheme } from '../../theme';
import { secureStorage } from '../../services/storage';

interface ProjectListProps {
  onSelectProject: (project: Project) => void;
  onEditProject?: (project: Project) => void;
  onShareProject?: (project: Project) => void;
  onNewReel: () => void;
}

export function ProjectList({ onSelectProject, onEditProject, onShareProject, onNewReel }: ProjectListProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { showActionSheetWithOptions } = useActionSheet();
  const [refreshing, setRefreshing] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    secureStorage.getToken().then(setAuthToken);
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
      fetchProjects();
    }
  }, [isAuthenticated, initialFetchComplete, fetchProjects]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProjects();
    setRefreshing(false);
  }, [fetchProjects]);

  const confirmDelete = useCallback((project: Project) => {
    Alert.alert(
      'Projekt löschen',
      `Möchtest du "${project.title}" wirklich löschen?`,
      [
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
      ]
    );
  }, [deleteProject]);

  const showProjectOptions = useCallback((project: Project) => {
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
        }
      }
    );
  }, [showActionSheetWithOptions, onSelectProject, onEditProject, onShareProject, confirmDelete]);

  const renderProject = useCallback(({ item }: { item: Project }) => {
    const thumbnailUrl = item.thumbnail_path ? getThumbnailUrl(item.id) : null;
    const duration = item.video_metadata?.duration;

    return (
      <TouchableOpacity
        style={[styles.projectCard, { backgroundColor: theme.card }]}
        onPress={() => onSelectProject(item)}
        onLongPress={() => showProjectOptions(item)}
        activeOpacity={0.7}
      >
        <View style={styles.thumbnailContainer}>
          {thumbnailUrl && authToken ? (
            <Image
              source={{
                uri: thumbnailUrl,
                headers: { Authorization: `Bearer ${authToken}` },
              }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.thumbnailPlaceholder, { backgroundColor: theme.border }]}>
              <Ionicons name="videocam" size={32} color={theme.textSecondary} />
            </View>
          )}
          {duration && (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{formatDuration(duration)}</Text>
            </View>
          )}
        </View>

        <View style={styles.projectInfo}>
          <Text style={[styles.projectTitle, { color: theme.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={styles.projectMeta}>
            <Ionicons name="time-outline" size={12} color={theme.textSecondary} />
            <Text style={[styles.projectDate, { color: theme.textSecondary }]}>
              {formatDate(item.last_edited_at)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => showProjectOptions(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="ellipsis-vertical" size={18} color={theme.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }, [theme, onSelectProject, showProjectOptions, authToken]);

  const renderEmpty = () => {
    if (isLoading && !initialFetchComplete) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="videocam-outline" size={64} color={theme.textSecondary} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>
          Noch keine Projekte
        </Text>
        <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
          Erstelle dein erstes Reel mit automatischen Untertiteln
        </Text>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={[styles.headerTitle, { color: theme.text }]}>Meine Reels</Text>
      <TouchableOpacity
        style={[styles.newButton, { backgroundColor: colors.primary[600] }]}
        onPress={onNewReel}
      >
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.newButtonText}>Neues Reel</Text>
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
            fetchProjects();
          }}
        >
          <Text style={styles.retryButtonText}>Erneut versuchen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderHeader()}
      <FlatList
        data={projects}
        renderItem={renderProject}
        keyExtractor={(item) => item.id}
        contentContainerStyle={projects.length === 0 ? styles.emptyListContent : styles.listContent}
        ListEmptyComponent={renderEmpty}
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
    fontSize: 24,
    fontWeight: '700',
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderRadius: 8,
    gap: 4,
  },
  newButtonText: {
    color: '#fff',
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
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.medium,
    borderRadius: 12,
    marginBottom: spacing.medium,
    gap: spacing.medium,
  },
  thumbnailContainer: {
    width: 80,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  projectInfo: {
    flex: 1,
    gap: 4,
  },
  projectTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  projectMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  projectDate: {
    fontSize: 12,
  },
  moreButton: {
    padding: spacing.small,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xlarge,
    gap: spacing.medium,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  footerText: {
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
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ProjectList;
