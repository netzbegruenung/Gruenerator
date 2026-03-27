import { Button, Skeleton, VideoCard } from '@gruenerator/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import apiClient from '../../../components/utils/apiClient';
import { useAuthStore } from '../../../stores/authStore';
import { useSubtitlerExportStore } from '../../../stores/subtitlerExportStore';
import { parseSubtitleBlocks } from '../../subtitler/utils/subtitleSegmentUtils';
import { useHistoryStore, useChunks } from '../stores/historyStore';
import { useSubtitlerBetaStore } from '../stores/subtitlerBetaStore';

import { BetaVideoPlayer } from './BetaVideoPlayer';
import { SubtitleList } from './SubtitleList';
import { SubtitleSettings, defaultSubtitleStyle } from './SubtitleSettings';

import type { BetaVideoPlayerRef } from './BetaVideoPlayer';
import type { SubtitleStyle } from './SubtitleSettings';
import type { SubtitleChunk, SubtitleTranscript } from '../types/subtitle';

interface SubtitlerProject {
  id: string;
  subtitles: string | null;
  title: string;
  style_preference: string;
  height_preference: string;
  style_settings: Record<string, any> | null;
  video_path: string | null;
  video_metadata: { width?: number; height?: number; duration?: number } | null;
  video_filename: string | null;
  video_size: number;
}

function segmentsToTranscript(subtitlesText: string, language = 'de'): SubtitleTranscript {
  const segments = parseSubtitleBlocks(subtitlesText);
  const chunks: SubtitleChunk[] = segments.map((s) => ({
    id: String(s.id),
    text: s.text,
    timestamp: [s.startTime, s.endTime] as [number, number],
  }));

  const totalDuration = chunks.length > 0 ? chunks[chunks.length - 1].timestamp[1] : 0;

  return {
    text: chunks.map((c) => c.text).join(' '),
    chunks,
    language,
    duration: totalDuration,
  };
}

interface ProjectListItem {
  id: string;
  title: string;
  video_filename: string | null;
  created_at: string;
  status: string;
  thumbnail_path: string | null;
  video_metadata: { duration?: number } | null;
}

function ProjectPicker({ onSelectProject }: { onSelectProject: (projectId: string) => void }) {
  const [projectsWithSubtitles, setProjectsWithSubtitles] = useState<ProjectListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get('/subtitler/projects')
      .then((res) => {
        const all: ProjectListItem[] = res.data?.projects || [];
        setProjectsWithSubtitles(all);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const baseURL = apiClient.defaults.baseURL || '';

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-[56rem] py-xl">
        <h2 className="mb-md text-xl font-bold text-foreground-heading">Beta Untertitel-Editor</h2>
        <p className="mb-lg text-sm text-grey-500">Wähle ein Projekt zum Bearbeiten.</p>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-md sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[9/16] w-full rounded-lg" />
            ))}
          </div>
        ) : projectsWithSubtitles.length === 0 ? (
          <div className="rounded-lg border border-grey-200 p-lg text-center text-grey-500 dark:border-grey-700">
            <p>Keine Projekte gefunden.</p>
            <p className="mt-sm text-sm">
              Erstelle zuerst ein Video mit Untertiteln unter{' '}
              <a href="/reel" className="text-primary-600 underline">
                /reel
              </a>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-md sm:grid-cols-3 lg:grid-cols-4">
            {projectsWithSubtitles.map((p) => (
              <VideoCard
                key={p.id}
                src={`${baseURL}/subtitler/projects/${p.id}/video`}
                poster={
                  p.thumbnail_path ? `${baseURL}/subtitler/projects/${p.id}/thumbnail` : undefined
                }
                title={p.title}
                duration={p.video_metadata?.duration}
                onClick={() => onSelectProject(p.id)}
              />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function SubtitlerBetaPageInner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const locale = useAuthStore((s) => s.locale);

  const [project, setProject] = useState<SubtitlerProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(defaultSubtitleStyle);

  const videoPlayerRef = useRef<BetaVideoPlayerRef>(null);
  const setTranscript = useHistoryStore((s) => s.setTranscript);
  const chunks = useChunks();
  const setCurrentTime = useSubtitlerBetaStore((s) => s.setCurrentTime);

  const exportStore = useSubtitlerExportStore();
  const { status: exportStatus, startExport, subscribe } = exportStore;

  useEffect(() => {
    const unsubscribe = subscribe();
    return unsubscribe;
  }, [subscribe]);

  const loadProject = useCallback(
    (projectId: string) => {
      setLoading(true);
      setError(null);
      apiClient
        .get(`/subtitler/projects/${projectId}`)
        .then((res) => {
          const p = res.data?.project as SubtitlerProject | undefined;
          if (!p) {
            setError('Projekt nicht gefunden.');
            setLoading(false);
            return;
          }

          setProject(p);

          if (p.subtitles) {
            const transcript = segmentsToTranscript(p.subtitles);
            setTranscript(transcript);
          }

          if (p.style_settings) {
            const s = p.style_settings;
            setSubtitleStyle((prev) => ({
              ...prev,
              ...(s.fontSize != null && { fontSize: s.fontSize }),
              ...(s.bottomOffset != null && { bottomOffset: s.bottomOffset }),
              ...(s.backgroundColor != null && { backgroundColor: s.backgroundColor }),
              ...(s.backgroundOpacity != null && { backgroundOpacity: s.backgroundOpacity }),
              ...(s.borderWidth != null && { borderWidth: s.borderWidth }),
              ...(s.shadowBlur != null && { shadowBlur: s.shadowBlur }),
            }));
          }

          setLoading(false);
        })
        .catch(() => {
          setError('Projekt konnte nicht geladen werden.');
          setLoading(false);
        });
    },
    [setTranscript]
  );

  // Load project from ?project= query param on mount or param change
  useEffect(() => {
    const projectId = searchParams.get('project');
    if (projectId && user?.id) {
      setSearchParams({}, { replace: true });
      loadProject(projectId);
      return;
    }

    // No project param — stop loading so the picker shows
    if (!searchParams.get('project')) {
      setLoading(false);
    }
  }, [searchParams, user?.id, setSearchParams, loadProject]);

  // Auto-save style settings to DB (debounced)
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

  const videoUrl = useMemo(() => {
    if (!project) return null;
    const baseURL = apiClient.defaults.baseURL || '';
    return `${baseURL}/subtitler/projects/${project.id}/video`;
  }, [project]);

  const handleTimeUpdate = useCallback(
    (time: number) => {
      setCurrentTime(time);
    },
    [setCurrentTime]
  );

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
      userId: user?.id || null,
    });
  }, [project, chunks, startExport, locale, user]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        <div className="flex w-72 flex-shrink-0 flex-col gap-sm border-r border-grey-200 p-sm dark:border-grey-700 lg:w-80">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
        <div className="flex flex-1 items-center justify-center bg-grey-950">
          <Skeleton className="aspect-[9/16] h-[70%] rounded-lg" />
        </div>
        <div className="flex w-72 flex-shrink-0 flex-col gap-sm border-l border-grey-200 p-sm dark:border-grey-700 lg:w-80">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <div className="flex h-[60vh] flex-col items-center justify-center gap-md">
          <p className="text-red-600">{error}</p>
          <Button variant="outline" onClick={() => window.history.back()}>
            Zurück
          </Button>
        </div>
      </PageContainer>
    );
  }

  if (!project || chunks.length === 0) {
    return <ProjectPicker onSelectProject={loadProject} />;
  }

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Left Panel: Subtitle List */}
      <div className="flex w-72 flex-shrink-0 flex-col border-r border-grey-200 bg-background dark:border-grey-700 lg:w-80">
        <SubtitleList videoPlayerRef={videoPlayerRef} />
      </div>

      {/* Center Panel: Video Player */}
      <div className="min-w-0 flex-1 overflow-hidden bg-grey-950">
        {videoUrl && (
          <BetaVideoPlayer
            ref={videoPlayerRef}
            videoUrl={videoUrl}
            className="h-full w-full"
            onTimeUpdate={handleTimeUpdate}
            subtitleStyle={subtitleStyle}
            onSubtitleStyleChange={setSubtitleStyle}
            onExport={handleExport}
            isExporting={exportStatus === 'starting' || exportStatus === 'exporting'}
          />
        )}
      </div>

      {/* Right Panel: Subtitle Settings */}
      <div className="w-72 flex-shrink-0 overflow-y-auto border-l border-grey-200 bg-background dark:border-grey-700 lg:w-80">
        <SubtitleSettings style={subtitleStyle} onStyleChange={setSubtitleStyle} />
      </div>
    </div>
  );
}

export default withAuthRequired(SubtitlerBetaPageInner);
