/**
 * SubtitleEditorScreen Component
 * Main orchestrator for subtitle editing
 */

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  useColorScheme,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useVideoPlayer } from 'expo-video';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';
import { Button } from '../common/Button';
import { EditorToolbar, OptionGrid, type ToolConfig, type OptionItem } from '../common/editor-toolbar';
import { useSubtitleEditorStore } from '../../stores/subtitleEditorStore';
import { useSubtitleEditor } from '../../hooks/useSubtitleEditor';
import { VideoPreviewWithSubtitle } from './VideoPreviewWithSubtitle';
import { SubtitleTimeline } from './SubtitleTimeline';
import { StylePreview } from './StylePreview';
import { HeightPreview } from './HeightPreview';
import { getVideoUrl } from '@gruenerator/shared';
import { secureStorage } from '../../services/storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';
import {
  SUBTITLE_STYLE_OPTIONS,
  SUBTITLE_HEIGHT_OPTIONS,
} from '@gruenerator/shared/subtitle-editor';
import type { Project } from '@gruenerator/shared';
import type { SubtitleSegment, SubtitleStylePreference, SubtitleHeightPreference } from '@gruenerator/shared/subtitle-editor';

interface SubtitleEditorScreenProps {
  project: Project;
  onBack: () => void;
  onSaved?: () => void;
}

export function SubtitleEditorScreen({
  project,
  onBack,
  onSaved,
}: SubtitleEditorScreenProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();
  const timelineRef = useRef<FlatList<SubtitleSegment>>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const loadProject = useSubtitleEditorStore((state) => state.loadProject);
  const reset = useSubtitleEditorStore((state) => state.reset);

  useEffect(() => {
    secureStorage.getToken().then(setAuthToken);
  }, []);

  const isTempProject = project.id.startsWith('temp-');

  useEffect(() => {
    const stylePreference = (project.style_preference || 'shadow') as SubtitleStylePreference;
    const heightPreference = (project.height_preference || 'tief') as SubtitleHeightPreference;
    const duration = project.video_metadata?.duration || 0;

    loadProject(
      project.id,
      project.upload_id,
      project.subtitles,
      stylePreference,
      heightPreference,
      duration
    );

    return () => {
      reset();
    };
  }, [project, loadProject, reset]);

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

  const {
    currentTime,
    segments,
    selectedSegmentId,
    editingSegmentId,
    activeSegmentId,
    stylePreference,
    heightPreference,
    hasUnsavedChanges,
    isSaving,
    error,
    isPlaying,
    handleSegmentTap,
    handleTextChange,
    handleEditComplete,
    togglePlayback,
    setStylePreference,
    setHeightPreference,
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

  const handleBack = useCallback(async () => {
    if (hasUnsavedChanges) {
      const shouldDiscard = await confirmDiscardChanges();
      if (!shouldDiscard) return;
    }
    onBack();
  }, [hasUnsavedChanges, confirmDiscardChanges, onBack]);

  const handleTextTool = useCallback(() => {
    if (selectedSegmentId !== null) {
      handleSegmentTap(selectedSegmentId);
    } else if (activeSegmentId !== null) {
      handleSegmentTap(activeSegmentId);
    } else if (segments.length > 0) {
      handleSegmentTap(segments[0].id);
    }
  }, [selectedSegmentId, activeSegmentId, segments, handleSegmentTap]);

  const styleOptions: OptionItem<SubtitleStylePreference>[] = useMemo(() =>
    SUBTITLE_STYLE_OPTIONS.map((opt) => ({
      id: opt.value,
      label: opt.label,
      recommended: opt.description === 'Empfohlen',
      renderPreview: () => <StylePreview style={opt.value} />,
    })),
    []
  );

  const heightOptions: OptionItem<SubtitleHeightPreference>[] = useMemo(() =>
    SUBTITLE_HEIGHT_OPTIONS.map((opt) => ({
      id: opt.value,
      label: opt.label,
      renderPreview: () => <HeightPreview position={opt.value} />,
    })),
    []
  );

  const toolbarTools: ToolConfig[] = useMemo(() => [
    {
      id: 'style',
      label: 'Stil',
      icon: 'brush-outline',
      hasPanel: true,
      renderPanel: () => (
        <OptionGrid
          options={styleOptions}
          value={stylePreference}
          onChange={setStylePreference}
          columns={4}
          compact
        />
      ),
    },
    {
      id: 'position',
      label: 'Position',
      icon: 'move-outline',
      hasPanel: true,
      renderPanel: () => (
        <OptionGrid
          options={heightOptions}
          value={heightPreference}
          onChange={setHeightPreference}
          columns={2}
        />
      ),
    },
    {
      id: 'text',
      label: 'Text',
      icon: 'text-outline',
      badge: segments.length,
      hasPanel: false,
      onPress: handleTextTool,
    },
  ], [styleOptions, heightOptions, stylePreference, heightPreference, setStylePreference, setHeightPreference, segments.length, handleTextTool]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Button onPress={handleBack} variant="ghost" style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </Button>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {project.title || 'Untertitel bearbeiten'}
        </Text>
        <Button
          onPress={handleSave}
          variant="primary"
          style={styles.headerButton}
          disabled={isSaving || !hasUnsavedChanges}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="checkmark" size={24} color={colors.white} />
          )}
        </Button>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

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

      <EditorToolbar
        tools={toolbarTools}
        disabled={isSaving}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 44,
    height: 44,
    padding: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.h3,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.small,
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
    color: colors.error,
    fontSize: 13,
    flex: 1,
  },
  previewSection: {
    alignItems: 'center',
    paddingVertical: spacing.small,
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
});
