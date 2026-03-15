import { Button } from '@gruenerator/ui';
import React, { useState, useCallback } from 'react';
import { FaPlus, FaTrash, FaClock, FaVideo, FaShare, FaUpload } from 'react-icons/fa';
import * as tus from 'tus-js-client';

import { ShareMediaModal } from '../../../components/common/ShareMediaModal';
import Spinner from '../../../components/common/Spinner';
import apiClient from '../../../components/utils/apiClient';
import useDragDropFiles, { VIDEO_ACCEPT } from '../../../hooks/useDragDropFiles';

import { cn } from '@/utils/cn';

interface VideoMetadata {
  duration?: number;
  width?: number;
  height?: number;
}

interface Project {
  id: string;
  title: string;
  thumbnail_path?: string;
  video_metadata?: VideoMetadata;
  last_edited_at?: string;
  video_size?: number;
}

interface ProjectCardProps {
  project: Project;
  onSelect: (projectId: string) => void;
  onDelete: (projectId: string) => Promise<void>;
  onShare: (project: Project) => void;
  isLoading: boolean;
}

const formatDuration = (seconds: number | undefined): string => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatDate = (dateStr: string | undefined): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatFileSize = (bytes: number | string | undefined): string => {
  const numBytes = Number(bytes);
  if (!numBytes || isNaN(numBytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = numBytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
};

const isDevelopment = import.meta.env.VITE_APP_ENV === 'development';
const baseURL = isDevelopment ? 'http://localhost:3001/api' : `${window.location.origin}/api`;
const TUS_UPLOAD_ENDPOINT = `${apiClient.defaults.baseURL}/subtitler/upload`;

const SkeletonCard = () => (
  <div className="overflow-hidden rounded-xl border border-grey-200 bg-background shadow-sm dark:border-grey-700 dark:bg-background-alt">
    <div className="aspect-[9/16] animate-pulse bg-gradient-to-r from-grey-200 via-grey-100 to-grey-200 dark:from-grey-800 dark:via-grey-700 dark:to-grey-800" />
    <div className="space-y-sm p-md">
      <div className="h-5 w-[70%] animate-pulse rounded bg-grey-200 dark:bg-grey-700" />
      <div className="h-4 w-[50%] animate-pulse rounded bg-grey-200 dark:bg-grey-700" />
    </div>
  </div>
);

const SkeletonGrid = () => (
  <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-md">
    {[1, 2, 3].map((i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);

const ProjectCard = ({ project, onSelect, onDelete, onShare, isLoading }: ProjectCardProps) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleShareClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onShare(project);
  };

  const handleDeleteClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setConfirmDelete(true);
  };

  const handleConfirmDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    try {
      await onDelete(project.id);
      setConfirmDelete(false);
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  const handleCancelDelete = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setConfirmDelete(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(project.id);
    }
  };

  const handleDeleteKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      setConfirmDelete(true);
    }
  };

  return (
    <div
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-xl border border-grey-200 bg-background shadow-sm transition-all',
        'hover:-translate-y-0.5 hover:shadow-lg dark:border-grey-700 dark:bg-background-alt',
        confirmDelete && 'pointer-events-none',
        isLoading && 'pointer-events-none opacity-70'
      )}
      onClick={() => !confirmDelete && !isLoading && onSelect(project.id)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Projekt ${project.title} öffnen`}
    >
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-background-alt">
        {project.thumbnail_path ? (
          <img
            src={`${baseURL}/subtitler/projects/${project.id}/thumbnail`}
            alt={project.title}
            loading="lazy"
            crossOrigin="use-credentials"
            className={cn(
              'h-full w-full object-cover transition-opacity',
              imageLoaded ? 'opacity-100' : 'opacity-0'
            )}
            onLoad={() => setImageLoaded(true)}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const nextSibling = target.nextSibling as HTMLElement;
              if (nextSibling) nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className="flex h-full items-center justify-center text-3xl text-grey-400"
          style={{ display: project.thumbnail_path ? 'none' : 'flex' }}
        >
          <FaVideo />
        </div>
        <div className="absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-black/80 via-black/40 to-transparent px-xs pb-xs pt-xl">
          <h3 className="truncate text-xs font-semibold text-white drop-shadow-sm">
            {project.title}
          </h3>
          <div className="mt-xxs flex flex-wrap items-center gap-x-sm text-[10px] text-white/70">
            <span className="flex items-center gap-xxs">
              <FaClock className="text-[9px]" />
              {formatDate(project.last_edited_at)}
            </span>
            <span>{formatDuration(project.video_metadata?.duration)}</span>
            <span>{formatFileSize(project.video_size)}</span>
          </div>
        </div>
      </div>

      <div className="absolute right-xs top-xs z-[3] flex gap-xxs">
        <button
          className={cn(
            'flex size-8 items-center justify-center rounded-full border-none bg-black/50 text-white backdrop-blur-sm transition-all',
            'opacity-0 -translate-y-1 group-hover:translate-y-0 group-hover:opacity-100',
            'max-md:translate-y-0 max-md:opacity-100',
            'hover:bg-black/70'
          )}
          onClick={handleShareClick}
          title="Projekt teilen"
          aria-label="Projekt teilen"
        >
          <FaShare className="text-xs" />
        </button>
        <button
          className={cn(
            'flex size-8 items-center justify-center rounded-full border-none bg-black/50 text-white backdrop-blur-sm transition-all',
            'opacity-0 -translate-y-1 group-hover:translate-y-0 group-hover:opacity-100',
            'max-md:translate-y-0 max-md:opacity-100',
            'hover:bg-red-600/80'
          )}
          onClick={handleDeleteClick}
          onKeyDown={handleDeleteKeyDown}
          title="Projekt löschen"
          aria-label="Projekt löschen"
        >
          <FaTrash className="text-xs" />
        </button>
      </div>

      {confirmDelete && (
        <div
          className="absolute inset-0 z-10 flex animate-in fade-in flex-col items-center justify-center gap-md rounded-xl bg-red-600/95"
          role="alertdialog"
          aria-labelledby="delete-confirm-text"
        >
          <p id="delete-confirm-text" className="text-sm font-medium text-white">
            Projekt löschen?
          </p>
          <div className="flex gap-sm">
            <Button variant="destructive" size="sm" onClick={handleConfirmDelete} autoFocus>
              Ja
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelDelete}
              className="border-white/50 text-white hover:bg-white/20"
            >
              Nein
            </Button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/40">
          <Spinner size="medium" />
        </div>
      )}
    </div>
  );
};

const getVideoMetadata = (file: File): Promise<VideoMetadata> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const metadata: VideoMetadata = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      resolve(metadata);
      URL.revokeObjectURL(video.src);
    };
    video.src = URL.createObjectURL(file);
  });
};

interface UploadData {
  originalFile: File;
  uploadId: string;
  metadata: VideoMetadata;
  name: string;
  size: number;
  type: string;
}

interface ProjectSelectorProps {
  onSelectProject: (projectId: string) => void;
  onUpload: (uploadData: UploadData) => void;
  onNewProject?: () => void;
  loadingProjectId: string | null;
  projects?: Project[];
  isLoading?: boolean;
  error?: string | null;
  onDeleteProject?: (projectId: string) => Promise<void>;
}

const ProjectSelector = ({
  onSelectProject,
  onUpload,
  onNewProject,
  loadingProjectId,
  projects = [],
  isLoading = false,
  error = null,
  onDeleteProject,
}: ProjectSelectorProps) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [shareProject, setShareProject] = useState<Project | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [currentUpload, setCurrentUpload] = useState<tus.Upload | null>(null);

  const handleDelete = useCallback(
    async (projectId: string) => {
      if (onDeleteProject) {
        await onDeleteProject(projectId);
      }
    },
    [onDeleteProject]
  );

  const handleShare = useCallback((project: Project) => {
    setShareProject(project);
  }, []);

  const startTusUpload = useCallback(
    async (file: File) => {
      try {
        setIsUploading(true);
        setUploadProgress(0);
        setUploadError(null);

        const metadata = await getVideoMetadata(file);
        const fileWithMetadata = file as File & { metadata?: VideoMetadata };
        fileWithMetadata.metadata = metadata;

        const upload = new tus.Upload(file, {
          endpoint: TUS_UPLOAD_ENDPOINT,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          chunkSize: 5 * 1024 * 1024,
          metadata: {
            filename: file.name,
            filetype: file.type,
          },
          onError: (error) => {
            console.error('[ProjectSelector] Upload error:', error);
            setUploadError('Upload fehlgeschlagen. Bitte versuche es erneut.');
            setIsUploading(false);
            setCurrentUpload(null);
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
            setUploadProgress(percentage);
          },
          onSuccess: () => {
            const uploadUrl = upload.url;
            const secureUploadUrl = uploadUrl?.startsWith('http://localhost')
              ? uploadUrl
              : (uploadUrl?.replace('http://', 'https://') ?? '');
            const uploadId = secureUploadUrl.split('/').pop() ?? '';

            setIsUploading(false);
            setUploadProgress(100);
            setCurrentUpload(null);

            const originalFile = upload.file as File;
            const metadataFromFile = fileWithMetadata.metadata ?? {};

            const uploadData: UploadData = {
              originalFile: originalFile,
              uploadId,
              metadata: metadataFromFile,
              name: originalFile.name,
              size: originalFile.size,
              type: originalFile.type,
            };

            onUpload(uploadData);
          },
        });

        setCurrentUpload(upload);
        upload.start();
      } catch (error) {
        console.error('[ProjectSelector] Upload start error:', error);
        setUploadError('Upload konnte nicht gestartet werden.');
        setIsUploading(false);
        setCurrentUpload(null);
      }
    },
    [onUpload]
  );

  const handleCancelUpload = useCallback(() => {
    if (currentUpload) {
      currentUpload.abort();
      setCurrentUpload(null);
    }
    setIsUploading(false);
    setUploadProgress(0);
    setUploadError(null);
  }, [currentUpload]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles?.length > 0) {
        const file = acceptedFiles[0];
        await startTusUpload(file);
      }
    },
    [startTusUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDragDropFiles({
    onFilesAccepted: onDrop,
    accept: VIDEO_ACCEPT,
    multiple: false,
    disabled: isUploading,
  });

  const handleNewProjectClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        startTusUpload(file);
      }
      e.target.value = '';
    },
    [startTusUpload]
  );

  return (
    <div className="flex flex-col gap-md" {...getRootProps()}>
      <input {...getInputProps()} />
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.mov,.avi,.mkv"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      <div className="flex items-center justify-between">
        <h1 className="text-[2rem] font-semibold text-foreground-heading max-md:text-2xl">
          Grünerator Reel-Studio
        </h1>
        <Button onClick={handleNewProjectClick}>
          <FaPlus /> Neues Projekt
        </Button>
      </div>

      {(error || uploadError) && (
        <div
          className="flex items-center justify-between gap-md rounded-lg border border-red-600 bg-red-50 p-md text-red-600 dark:bg-grey-800"
          role="alert"
        >
          <span>{error || uploadError}</span>
          {uploadError && (
            <Button variant="ghost" size="sm" onClick={() => setUploadError(null)}>
              Schließen
            </Button>
          )}
        </div>
      )}

      {isLoading ? (
        <SkeletonGrid />
      ) : projects.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-md">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onSelect={onSelectProject}
              onDelete={handleDelete}
              onShare={handleShare}
              isLoading={project.id === loadingProjectId}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[300px] grow flex-col items-center justify-center px-lg py-2xl text-center">
          <FaVideo className="mb-md text-4xl text-grey-300" />
          <h2 className="text-lg font-semibold text-foreground-heading">Noch keine Projekte</h2>
          <p className="mt-xs text-foreground">
            Klicke auf &quot;Neues Projekt&quot; um zu starten
          </p>
        </div>
      )}

      <p className="text-center text-xs text-grey-400">
        Maximal 20 Projekte werden gespeichert. Ältere Projekte werden automatisch gelöscht.
      </p>

      {(isDragActive || isUploading) && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-[90%] max-w-[400px] rounded-xl border-2 border-dashed border-primary-500 bg-background p-2xl text-center shadow-xl dark:bg-background-alt">
            {isUploading ? (
              <>
                <div className="flex items-center gap-sm">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-background-alt">
                    <div
                      className="h-full rounded-full bg-primary-500 transition-[width] duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="min-w-[3ch] text-sm font-medium tabular-nums">
                    {uploadProgress}%
                  </span>
                </div>
                <p className="mt-sm text-sm text-foreground">Video wird hochgeladen...</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-md"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    handleCancelUpload();
                  }}
                >
                  Abbrechen
                </Button>
              </>
            ) : (
              <>
                <FaUpload className="mx-auto mb-md text-4xl text-primary-500" />
                <h3 className="text-lg font-semibold text-foreground-heading">
                  Video hier ablegen
                </h3>
                <p className="mt-xs text-sm text-grey-500">MP4, MOV, AVI, MKV &bull; Max. 500MB</p>
              </>
            )}
          </div>
        </div>
      )}

      {shareProject && (
        <ShareMediaModal
          isOpen={!!shareProject}
          onClose={() => setShareProject(null)}
          mediaType="video"
          projectId={shareProject.id}
          defaultTitle={shareProject.title}
          imageData={{}}
        />
      )}
    </div>
  );
};

export default ProjectSelector;
