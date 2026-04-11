import { Skeleton, UploadZone, VideoCard } from '@gruenerator/ui';
import { Film, Upload } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import apiClient from '../../../components/utils/apiClient';
import { useTusUpload } from '../hooks/useTusUpload';
import { useHistoryStore } from '../stores/historyStore';
import { useWizardStore } from '../stores/wizardStore';
import { segmentsToTranscript } from '../utils/segmentsToTranscript';

import type { Accept } from 'react-dropzone';

const VIDEO_ACCEPT: Accept = {
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/x-matroska': ['.mkv'],
  'video/webm': ['.webm'],
};

interface ProjectListItem {
  id: string;
  title: string;
  video_filename: string | null;
  created_at: string;
  status: string;
  thumbnail_path: string | null;
  video_metadata: { duration?: number } | null;
  subtitles: string | null;
}

export function ImportStep() {
  const { upload, progress, isUploading, error: uploadError } = useTusUpload();
  const finishUpload = useWizardStore((s) => s.finishUpload);
  const loadExistingProject = useWizardStore((s) => s.loadExistingProject);
  const setTranscript = useHistoryStore((s) => s.setTranscript);

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);

  useEffect(() => {
    apiClient
      .get<{ projects?: ProjectListItem[] }>('/subtitler/projects')
      .then((res) => {
        setProjects(res.data?.projects ?? []);
      })
      .catch(() => {})
      .finally(() => setIsLoadingProjects(false));
  }, []);

  const handleFileSelected = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;

      try {
        const result = await upload(file);
        finishUpload(result.uploadId);
      } catch {
        // error state handled by useTusUpload
      }
    },
    [upload, finishUpload]
  );

  const handleSelectProject = useCallback(
    (projectId: string) => {
      apiClient
        .get<{ project?: { subtitles?: string | null } }>(`/subtitler/projects/${projectId}`)
        .then((res) => {
          const p = res.data?.project;
          if (!p) return;
          if (p.subtitles) {
            setTranscript(segmentsToTranscript(p.subtitles));
          }
          loadExistingProject(projectId);
        })
        .catch(() => {});
    },
    [loadExistingProject, setTranscript]
  );

  const baseURL = apiClient.defaults.baseURL || '';

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[56rem] px-md py-xl">
        {/* Upload Area */}
        <div className="mb-xl">
          <h2 className="mb-xs text-xl font-bold text-foreground-heading">Video hochladen</h2>
          <p className="mb-md text-sm text-grey-500">
            Lade ein Video hoch, um automatisch Untertitel zu erstellen.
          </p>

          <UploadZone
            accept={VIDEO_ACCEPT}
            onFilesSelected={handleFileSelected}
            disabled={isUploading}
            icon={<Upload className="h-6 w-6 text-primary-600 dark:text-primary-400" />}
            title="Video hierher ziehen oder klicken"
            subtitle="MP4, MOV, AVI, MKV, WebM"
          />

          {isUploading && (
            <div className="mt-md">
              <div className="flex items-center justify-between text-sm text-grey-600">
                <span>Wird hochgeladen...</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-xs h-2 overflow-hidden rounded-full bg-grey-200 dark:bg-grey-700">
                <div
                  className="h-full rounded-full bg-primary-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {uploadError && <p className="mt-sm text-sm text-red-600">{uploadError}</p>}
        </div>

        {/* Existing Projects */}
        <div>
          <h3 className="mb-xs text-lg font-semibold text-foreground-heading">
            Bestehende Projekte
          </h3>
          <p className="mb-md text-sm text-grey-500">
            Oder wähle ein bestehendes Projekt zum Bearbeiten.
          </p>

          {isLoadingProjects ? (
            <div className="grid grid-cols-2 gap-md sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[9/16] w-full rounded-lg" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-grey-300 p-lg text-center text-grey-500 dark:border-grey-600">
              <Film className="mx-auto mb-sm h-8 w-8 text-grey-400" />
              <p>Noch keine Projekte vorhanden.</p>
              <p className="mt-xs text-sm">Lade dein erstes Video hoch, um loszulegen.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-md sm:grid-cols-3 lg:grid-cols-4">
              {projects.map((p) => (
                <VideoCard
                  key={p.id}
                  src={`${baseURL}/subtitler/projects/${p.id}/video`}
                  poster={
                    p.thumbnail_path ? `${baseURL}/subtitler/projects/${p.id}/thumbnail` : undefined
                  }
                  title={p.title}
                  duration={p.video_metadata?.duration}
                  onClick={() => handleSelectProject(p.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
