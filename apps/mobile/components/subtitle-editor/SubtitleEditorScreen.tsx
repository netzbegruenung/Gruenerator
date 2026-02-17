/**
 * SubtitleEditorScreen Component
 * Main orchestrator for subtitle editing
 * Uses CategoryBar + InlineBar pattern for performant editing
 */

import { Ionicons } from '@expo/vector-icons';
import { getVideoUrl, getProject } from '@gruenerator/shared';
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
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';
import { DraggableSplitView } from '../common/DraggableSplitView';
import { CategoryBar, InlineBar } from '../common/editor-toolbar';

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
}

const TOOLBAR_HEIGHT = 80;
const ERROR_BANNER_HEIGHT = 36;

export function SubtitleEditorScreen({
  project: initialProject,
  onBack,
  onSaved,
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
  const [showShareModal, setShowShareModal] = useState(false);

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
    secureStorage.getToken().then(setAuthToken);
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

    loadFullProjectData();
  }, [initialProject.id, initialProject.subtitles, isTempProject]);

  const needsFullProjectFetch = !isTempProject && !initialProject.subtitles && !fullProject;

  useEffect(() => {
    if (isLoadingProject || needsFullProjectFetch) return;

    const stylePreference = (project.style_preference || 'shadow') as SubtitleStylePreference;
    const heightPreference = (project.height_preference || 'tief') as SubtitleHeightPreference;
    const duration = project.video_metadata?.duration || 0;

    loadProjectToStore(
      project.id,
      project.upload_id,
      project.subtitles,
      stylePreference,
      heightPreference,
      duration
    );
  }, [project, loadProjectToStore, isLoadingProject, needsFullProjectFetch]);

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  const videoUri = isTempProject
    ? `${API_BASE_URL}/subtitler/internal-video/${project.upload_id}`
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
          confirmDiscardChanges();
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

  const handleExport = useCallback(() => {
    exportHook.startExport();
  }, [exportHook.startExport]);

  const handleBackToEditor = useCallback(() => {
    exportHook.reset();
  }, [exportHook.reset]);

  const handleGoHome = useCallback(() => {
    router.replace('/(tabs)/start');
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
    return (
      <View
        style={[styles.container, styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={[styles.loadingText, { color: theme.text }]}>Projekt wird geladen...</Text>
      </View>
    );
  }

  if (exportHook.status !== 'idle') {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
        edges={['top']}
      >
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
        <Pressable style={styles.modalOverlay} onPress={() => setShowShareModal(false)}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Pressable
              style={[styles.modalOption, { borderBottomColor: theme.border }]}
              onPress={handleShareSave}
              disabled={isSaving}
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
  loadingText: {
    fontSize: 16,
    fontWeight: '500',
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
    fontSize: 13,
    flex: 1,
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
    fontSize: 16,
    fontWeight: '600',
  },
  modalOptionDesc: {
    fontSize: 13,
    marginTop: 2,
  },
});
