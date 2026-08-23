/**
 * SubtitleEditorScreen Component
 * Main orchestrator for subtitle editing
 * Uses CategoryBar + InlineBar pattern for performant editing
 */

import { getVideoUrl, getProject } from '@gruenerator/shared';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useVideoPlayer } from 'expo-video';
import { useRef, useEffect, useCallback, useState, lazy, Suspense } from 'react';
import {
  View,
  Text,
  StyleSheet,
  type FlatList,
  Pressable,
  useColorScheme,
  useWindowDimensions,
  ActivityIndicator,
  Platform,
  Keyboard,
  Modal,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';

import { SUBTITLE_CATEGORIES, type SubtitleEditCategory } from '../../config/subtitleEditorConfig';
import { useSubtitleEditor } from '../../hooks/useSubtitleEditor';
import { useSubtitleExport } from '../../hooks/useSubtitleExport';
import { secureStorage } from '../../services/storage';
import { useSubtitleEditorStore } from '../../stores/subtitleEditorStore';
import { colors, spacing, borderRadius, lightTheme, darkTheme, BODY_FONT } from '../../theme';
import { DraggableSplitView } from '../common/DraggableSplitView';
import { CategoryBar, InlineBar } from '../common/editor-toolbar';
import { SkeletonBar, SkeletonGroup, SkeletonRows } from '../common/Skeleton';

import { StyleControl, PositionControl } from './controls';
import { SubtitleTimeline } from './SubtitleTimeline';

const LazyExportScreen = lazy(() =>
  import('./ExportResultScreen').then((m) => ({ default: m.ExportScreen }))
);
import { VideoPreviewWithSubtitle } from './VideoPreviewWithSubtitle';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';
import type { Project } from '@gruenerator/shared';
import type {
  SubtitleSegment,
  SubtitleStylePreference,
  SubtitleHeightPreference,
} from '@gruenerator/shared/subtitle-editor';

interface SubtitleEditorScreenProps {
  project: Project;
  onBack: () => void;
  onSaved?: () => void;
  /** Open the share/export sheet right away (deep link from ReelReadyScreen). */
  initialShowShare?: boolean;
}

const TOOLBAR_HEIGHT = 80;
const ERROR_BANNER_HEIGHT = 36;

export function SubtitleEditorScreen({
  project: initialProject,
  onBack,
  onSaved,
  initialShowShare = false,
}: SubtitleEditorScreenProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const timelineRef = useRef<FlatList<SubtitleSegment>>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [fullProject, setFullProject] = useState<Project | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.4);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [inlineCategory, setInlineCategory] = useState<SubtitleEditCategory | null>(null);
  const [showShareModal, setShowShareModal] = useState(initialShowShare);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const loadProjectToStore = useSubtitleEditorStore((state) => state.loadProject);
  const reset = useSubtitleEditorStore((state) => state.reset);

  const isTempProject = initialProject.id.startsWith('temp-');
  const project = fullProject || initialProject;

  useEffect(() => {
    void secureStorage.getToken().then(setAuthToken);
  }, []);

  useEffect(() => {
    const loadFullProjectData = async () => {
      if (!isTempProject && !initialProject.subtitles) {
        setIsLoadingProject(true);
        try {
          const loaded = await getProject(initialProject.id);
          setFullProject(loaded);
        } catch (error) {
          console.error('[SubtitleEditorScreen] Failed to load full project:', error);
        } finally {
          setIsLoadingProject(false);
        }
      }
    };

    void loadFullProjectData();
  }, [initialProject.id, initialProject.subtitles, isTempProject]);

  const needsFullProjectFetch = !isTempProject && !initialProject.subtitles && !fullProject;

  useEffect(() => {
    if (isLoadingProject || needsFullProjectFetch) return;

    const stylePreference = (project.style_preference || 'shadow') as SubtitleStylePreference;
    const heightPreference = (project.height_preference || 'tief') as SubtitleHeightPreference;
    const duration = project.video_metadata?.duration || 0;

    loadProjectToStore(
      project.id,
      // Server rows carry no upload_id (consumed at create time); only
      // client-built temp projects have it. Derive from the temp id as a
      // fallback so the store never sees null.
      project.upload_id ?? (isTempProject ? project.id.replace('temp-', '') : ''),
      project.subtitles,
      stylePreference,
      heightPreference,
      duration
    );
  }, [project, loadProjectToStore, isLoadingProject, needsFullProjectFetch, isTempProject]);

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  const videoUri = isTempProject
    ? `${API_BASE_URL}/subtitler/internal-video/${project.upload_id ?? project.id.replace('temp-', '')}`
    : getVideoUrl(project.id);

  const videoSource = isTempProject
    ? videoUri
    : authToken
      ? { uri: videoUri, headers: { Authorization: `Bearer ${authToken}` } }
      : null;

  const player = useVideoPlayer(videoSource ?? '', (p) => {
    p.loop = true;
  });

  // Per-property selectors for video preview (controls use their own selectors)
  const stylePreference = useSubtitleEditorStore((s) => s.stylePreference);
  const heightPreference = useSubtitleEditorStore((s) => s.heightPreference);

  const {
    currentTime,
    segments,
    selectedSegmentId,
    editingSegmentId,
    activeSegmentId,
    hasUnsavedChanges,
    isSaving,
    error,
    isPlaying,
    handleSegmentTap,
    handleTextChange,
    handleEditComplete,
    togglePlayback,
    saveChanges,
    confirmDiscardChanges,
  } = useSubtitleEditor({ player, timelineRef });

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (hasUnsavedChanges) {
          void confirmDiscardChanges();
        }
      };
    }, [hasUnsavedChanges, confirmDiscardChanges])
  );

  const handleSave = useCallback(async () => {
    const success = await saveChanges();
    if (success && onSaved) {
      onSaved();
    }
  }, [saveChanges, onSaved]);

  const exportHook = useSubtitleExport(saveChanges);
  const { startExport, reset: resetExport } = exportHook;

  const handleExport = useCallback(() => {
    void startExport();
  }, [startExport]);

  const handleBackToEditor = useCallback(() => {
    resetExport();
  }, [resetExport]);

  const handleGoHome = useCallback(() => {
    void router.replace('/(tabs)/start');
  }, [router]);

  const handleBack = useCallback(async () => {
    if (hasUnsavedChanges) {
      const shouldDiscard = await confirmDiscardChanges();
      if (!shouldDiscard) return;
    }
    onBack();
  }, [hasUnsavedChanges, confirmDiscardChanges, onBack]);

  const handleShareSave = useCallback(async () => {
    setShowShareModal(false);
    const success = await saveChanges();
    if (success) {
      onBack();
    }
  }, [saveChanges, onBack]);

  const handleShareExport = useCallback(() => {
    setShowShareModal(false);
    handleExport();
  }, [handleExport]);

  const handleCategorySelect = useCallback(
    (categoryId: SubtitleEditCategory) => {
      if (categoryId === 'text') {
        // Text tool - start editing a segment
        if (selectedSegmentId !== null) {
          handleSegmentTap(selectedSegmentId);
        } else if (activeSegmentId !== null) {
          handleSegmentTap(activeSegmentId);
        } else if (segments.length > 0) {
          handleSegmentTap(segments[0].id);
        }
      } else {
        // Style or position - show inline editor
        setInlineCategory(categoryId);
      }
    },
    [selectedSegmentId, activeSegmentId, segments, handleSegmentTap]
  );

  const handleInlineClose = useCallback(() => {
    setInlineCategory(null);
  }, []);

  if (isLoadingProject) {
    // The split the editor opens in: the 9:16 preview above, the subtitle
    // timeline below. Both halves are laid out before the project arrives.
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
        edges={['top']}
      >
        <View style={styles.previewSection}>
          <SkeletonGroup style={styles.previewSkeleton}>
            <SkeletonBar width="100%" height="100%" radius={borderRadius.large} />
          </SkeletonGroup>
        </View>
        <View style={styles.timelineSection}>
          <View style={[styles.timelineHeader, { borderBottomColor: theme.border }]}>
            <SkeletonGroup>
              <SkeletonBar width={140} height={15} />
            </SkeletonGroup>
          </View>
          <SkeletonRows count={5} leading={0} />
        </View>
      </SafeAreaView>
    );
  }

  if (exportHook.status !== 'idle') {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
        edges={['top']}
      >
        {/* Deliberately still a spinner: what loads behind it is the export
            progress screen, and an export is an operation with its own progress
            bar, not a surface whose layout could be promised. */}
        <Suspense
          fallback={
            <View style={[styles.container, styles.loadingContainer]}>
              <ActivityIndicator size="large" color={colors.primary[600]} />
            </View>
          }
        >
          <LazyExportScreen
            status={exportHook.status}
            progress={exportHook.progress}
            videoUri={exportHook.videoUri}
            error={exportHook.error}
            errorId={exportHook.errorId}
            onBackToEditor={handleBackToEditor}
            onGoHome={handleGoHome}
          />
        </Suspense>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior="padding">
        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={colors.error[500]} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <DraggableSplitView
          containerHeight={
            windowHeight -
            insets.top -
            insets.bottom -
            (isKeyboardVisible ? 0 : TOOLBAR_HEIGHT) -
            (error ? ERROR_BANNER_HEIGHT : 0)
          }
          initialRatio={splitRatio}
          minTopRatio={0.25}
          maxTopRatio={0.65}
          onRatioChange={setSplitRatio}
          topContent={
            <View style={styles.previewSection}>
              <VideoPreviewWithSubtitle
                videoUri={videoUri}
                isRemoteVideo={true}
                requiresAuth={!isTempProject}
                segments={segments}
                currentTime={currentTime}
                stylePreference={stylePreference}
                heightPreference={heightPreference}
                onTogglePlayback={togglePlayback}
                isPlaying={isPlaying}
              />
            </View>
          }
          bottomContent={
            <View style={styles.timelineSection}>
              <View style={[styles.timelineHeader, { borderBottomColor: theme.border }]}>
                <Text style={[styles.timelineTitle, { color: theme.text }]}>
                  Untertitel ({segments.length})
                </Text>
                {hasUnsavedChanges && (
                  <View style={styles.unsavedBadge}>
                    <Text style={styles.unsavedBadgeText}>Ungespeichert</Text>
                  </View>
                )}
              </View>
              <SubtitleTimeline
                ref={timelineRef}
                segments={segments}
                activeSegmentId={activeSegmentId}
                selectedSegmentId={selectedSegmentId}
                editingSegmentId={editingSegmentId}
                onSegmentTap={handleSegmentTap}
                onTextChange={handleTextChange}
                onEditComplete={handleEditComplete}
              />
            </View>
          }
        />

        {!isKeyboardVisible &&
          (inlineCategory ? (
            <InlineBar onClose={handleInlineClose}>
              {inlineCategory === 'style' && <StyleControl disabled={isSaving} />}
              {inlineCategory === 'position' && <PositionControl disabled={isSaving} />}
            </InlineBar>
          ) : (
            <CategoryBar
              categories={SUBTITLE_CATEGORIES}
              onSelectCategory={handleCategorySelect}
              trailing={
                <Pressable
                  style={[styles.shareChip, { backgroundColor: theme.background }]}
                  onPress={() => setShowShareModal(true)}
                  accessibilityRole="button"
                >
                  <Ionicons name="share-outline" size={20} color={colors.primary[600]} />
                  <Text style={[styles.shareChipText, { color: theme.text }]}>Teilen</Text>
                </Pressable>
              }
            />
          ))}
      </KeyboardAvoidingView>

      <Modal
        visible={showShareModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowShareModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowShareModal(false)}
          accessibilityRole="button"
          accessibilityLabel="Menü schließen"
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Pressable
              style={[styles.modalOption, { borderBottomColor: theme.border }]}
              onPress={handleShareSave}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityState={{ disabled: isSaving }}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.primary[600]} />
              ) : (
                <Ionicons name="checkmark-circle-outline" size={24} color={colors.primary[600]} />
              )}
              <View style={styles.modalOptionText}>
                <Text style={[styles.modalOptionTitle, { color: theme.text }]}>Speichern</Text>
                <Text style={[styles.modalOptionDesc, { color: theme.textSecondary }]}>
                  Änderungen sichern und zurück
                </Text>
              </View>
            </Pressable>
            <Pressable
              style={styles.modalOption}
              onPress={handleShareExport}
              disabled={isSaving || exportHook.status !== 'idle'}
              accessibilityRole="button"
              accessibilityState={{ disabled: isSaving || exportHook.status !== 'idle' }}
            >
              <Ionicons name="download-outline" size={24} color={colors.primary[600]} />
              <View style={styles.modalOptionText}>
                <Text style={[styles.modalOptionTitle, { color: theme.text }]}>Exportieren</Text>
                <Text style={[styles.modalOptionDesc, { color: theme.textSecondary }]}>
                  Video mit Untertiteln erstellen
                </Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.medium,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    backgroundColor: 'rgba(211, 47, 47, 0.1)',
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.medium,
  },
  errorText: {
    color: colors.error[500],
    fontFamily: BODY_FONT,
    fontSize: 13,
    flex: 1,
  },
  // Mirrors `VideoPreviewWithSubtitle`'s own container, which is what will
  // stand here once the project has loaded.
  previewSkeleton: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 280,
  },
  previewSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.medium,
  },
  timelineSection: {
    flex: 1,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderBottomWidth: 1,
  },
  timelineTitle: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    fontWeight: '600',
  },
  unsavedBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.xsmall,
    paddingVertical: 2,
    borderRadius: borderRadius.small,
  },
  unsavedBadgeText: {
    fontFamily: BODY_FONT,
    fontSize: 11,
    fontWeight: '600',
    color: colors.white,
  },
  shareChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: borderRadius.full,
  },
  shareChipText: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xlarge,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    borderRadius: borderRadius.large,
    overflow: 'hidden',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
    padding: spacing.large,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  modalOptionText: {
    flex: 1,
  },
  modalOptionTitle: {
    fontFamily: BODY_FONT,
    fontSize: 16,
    fontWeight: '600',
  },
  modalOptionDesc: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    marginTop: 2,
  },
});
