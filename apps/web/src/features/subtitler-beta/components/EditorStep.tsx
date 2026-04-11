import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import apiClient from '../../../components/utils/apiClient';
import { useAuthStore } from '../../../stores/authStore';
import { useSubtitlerExportStore } from '../../../stores/subtitlerExportStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useHistoryStore, useChunks } from '../stores/historyStore';
import { useSubtitlerBetaStore } from '../stores/subtitlerBetaStore';
import { segmentsToTranscript } from '../utils/segmentsToTranscript';

import { KeyboardShortcutHelp } from './KeyboardShortcutHelp';
import { SubtitlePanel } from './SubtitlePanel';
import { defaultSubtitleStyle } from './SubtitleSettings';
import { VideoPanel } from './VideoPanel';

import type { BetaVideoPlayerRef } from './BetaVideoPlayer';
import type { SubtitleStyle } from './SubtitleSettings';

interface SubtitlerProject {
  id: string;
  subtitles: string | null;
  title: string;
  style_preference: string;
  height_preference: string;
  style_settings: Record<string, unknown> | null;
  video_path: string | null;
  video_metadata: { width?: number; height?: number; duration?: number } | null;
  video_filename: string | null;
  video_size: number;
}

interface EditorStepProps {
  projectId: string;
}

export function EditorStep({ projectId }: EditorStepProps) {
  const userId = useAuthStore((s) => s.user?.id);
  const locale = useAuthStore((s) => s.locale);
  const setTranscript = useHistoryStore((s) => s.setTranscript);
  const chunks = useChunks();
  const setCurrentTime = useSubtitlerBetaStore((s) => s.setCurrentTime);

  const [project, setProject] = useState<SubtitlerProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(defaultSubtitleStyle);

  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
  const videoPlayerRef = useRef<BetaVideoPlayerRef>(null);
  const exportStore = useSubtitlerExportStore();
  const { status: exportStatus, startExport, subscribe } = exportStore;

  useEffect(() => {
    const unsubscribe = subscribe();
    return unsubscribe;
  }, [subscribe]);

  // Load project data
  useEffect(() => {
    setLoading(true);
    apiClient
      .get<{ project?: SubtitlerProject }>(`/subtitler/projects/${projectId}`)
      .then((res) => {
        const p = res.data?.project;
        if (!p) {
          setLoading(false);
          return;
        }
        setProject(p);

        if (p.subtitles) {
          setTranscript(segmentsToTranscript(p.subtitles));
        }

        if (p.style_settings) {
          const s = p.style_settings;
          setSubtitleStyle((prev) => ({
            ...prev,
            ...(s.fontSize != null && { fontSize: Number(s.fontSize) }),
            ...(s.bottomOffset != null && { bottomOffset: Number(s.bottomOffset) }),
            ...(s.backgroundColor != null && { backgroundColor: String(s.backgroundColor) }),
            ...(s.backgroundOpacity != null && { backgroundOpacity: Number(s.backgroundOpacity) }),
            ...(s.borderWidth != null && { borderWidth: Number(s.borderWidth) }),
            ...(s.shadowBlur != null && { shadowBlur: Number(s.shadowBlur) }),
            ...(s.activePresetId != null && { activePresetId: String(s.activePresetId) }),
          }));
        }

        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [projectId, setTranscript]);

  // Auto-save style settings (debounced)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadRef = useRef(true);
  useEffect(() => {
    if (!project || initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      apiClient
        .put(`/subtitler/projects/${project.id}`, {
          styleSettings: {
            fontSize: subtitleStyle.fontSize,
            bottomOffset: subtitleStyle.bottomOffset,
            backgroundColor: subtitleStyle.backgroundColor,
            backgroundOpacity: subtitleStyle.backgroundOpacity,
            borderWidth: subtitleStyle.borderWidth,
            shadowBlur: subtitleStyle.shadowBlur,
          },
        })
        .catch(() => {});
    }, 1000);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [subtitleStyle, project]);

  const handleTimeUpdate = useCallback((time: number) => setCurrentTime(time), [setCurrentTime]);

  const handleExport = useCallback(async () => {
    if (!project || chunks.length === 0) return;
    const activeChunks = chunks.filter((c) => !c.deleted);
    const subtitlesForExport = activeChunks.map((c) => ({
      start: c.timestamp[0],
      end: c.timestamp[1],
      text: c.text,
    }));
    await startExport(subtitlesForExport, {
      uploadId: project.id,
      subtitlePreference: 'manual',
      stylePreference: 'shadow',
      heightPreference: 'tief',
      locale: locale || 'de-DE',
      maxResolution: 1080,
      projectId: project.id,
      userId: userId || null,
    });
  }, [project, chunks, startExport, locale, userId]);

  const videoUrl = useMemo(() => {
    if (!project) return null;
    const baseURL = apiClient.defaults.baseURL || '';
    return `${baseURL}/subtitler/projects/${project.id}/video`;
  }, [project]);

  useKeyboardShortcuts({
    onPlayPause: () => videoPlayerRef.current?.togglePlayPause(),
    onSeekForward: (seconds) => videoPlayerRef.current?.skip(seconds),
    onSeekBackward: (seconds) => videoPlayerRef.current?.skip(-seconds),
    onToggleFindReplace: () => setIsFindReplaceOpen((prev) => !prev),
    onShowHelp: () => setIsShortcutHelpOpen(true),
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-grey-500">
        Projekt nicht gefunden.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden md:flex-row">
      {/* Left: Video Panel (flex-[3]) */}
      <VideoPanel
        videoUrl={videoUrl}
        videoPlayerRef={videoPlayerRef}
        subtitleStyle={subtitleStyle}
        onSubtitleStyleChange={setSubtitleStyle}
        onTimeUpdate={handleTimeUpdate}
        onExport={handleExport}
        isExporting={exportStatus === 'starting' || exportStatus === 'exporting'}
      />

      {/* Right: Subtitle Panel (flex-[2]) */}
      <SubtitlePanel
        videoPlayerRef={videoPlayerRef}
        projectId={project.id}
        projectTitle={project.title}
        isFindReplaceOpen={isFindReplaceOpen}
        onToggleFindReplace={() => setIsFindReplaceOpen((prev) => !prev)}
      />

      <KeyboardShortcutHelp
        isOpen={isShortcutHelpOpen}
        onClose={() => setIsShortcutHelpOpen(false)}
      />
    </div>
  );
}
