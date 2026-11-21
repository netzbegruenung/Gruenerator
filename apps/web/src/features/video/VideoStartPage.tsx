/**
 * /video — one start page for the three video paths: Untertitel (the simple
 * way: upload, captions, download), KI-Schnitt and the Video Editor. It only
 * picks the way and takes the files; the upload itself runs on the page of
 * that way, which receives the files as router state (`VideoStartState`).
 */
import { Button, UploadZone } from '@gruenerator/ui';
import { useState } from 'react';
import { PiFilmSlate, PiMagicWand, PiSubtitles } from 'react-icons/pi';
import { Link, useNavigate } from 'react-router-dom';

import PageContainer from '@/components/common/PageContainer';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';
import { useCanSeeAdminTools } from '@/config/adminToolsGate';
import { getToolGradient } from '@/config/toolTheme';
import { cn } from '@/utils/cn';

import { type VideoStartState } from './videoStartState';

const VIDEO_ACCEPT = {
  'video/mp4': ['.mp4', '.m4v'],
  'video/quicktime': ['.mov'],
  'video/webm': ['.webm'],
  'video/x-msvideo': ['.avi'],
  'video/x-matroska': ['.mkv'],
};

const KI_ACCEPT = {
  'video/mp4': ['.mp4', '.m4v'],
  'video/quicktime': ['.mov'],
  'video/webm': ['.webm'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'audio/mpeg': ['.mp3'],
  'audio/mp4': ['.m4a'],
  'audio/wav': ['.wav'],
  'audio/ogg': ['.ogg', '.opus'],
  'audio/flac': ['.flac'],
};

const WAYS = [
  {
    id: 'untertitel',
    label: 'Untertitel',
    icon: PiSubtitles,
    lead: 'Video hochladen, Untertitel kommen automatisch, fertig zum Download.',
  },
  {
    id: 'ki-schnitt',
    label: 'KI-Schnitt',
    icon: PiMagicWand,
    lead: 'Rohmaterial hochladen, die KI schneidet daraus ein Reel mit Untertiteln.',
  },
  {
    id: 'editor',
    label: 'Video Editor',
    icon: PiFilmSlate,
    lead: 'Video hochladen, es öffnet sich mit fertigen Untertiteln im Editor.',
  },
] as const;

type WayId = (typeof WAYS)[number]['id'];

function VideoStart() {
  useDocumentTitle('Video – Grünerator');
  const navigate = useNavigate();
  const [way, setWay] = useState<WayId>('untertitel');
  const [error, setError] = useState<string | null>(null);
  // KI-Schnitt is still behind the admin tool gate (adminToolsGate.tsx).
  const canSeeKiSchnitt = useCanSeeAdminTools();
  const ways = WAYS.filter((w) => w.id !== 'ki-schnitt' || canSeeKiSchnitt);
  const current = ways.find((w) => w.id === way) ?? ways[0];

  const go = (files: File[]) => {
    if (files.length === 0) return;
    if (current.id === 'ki-schnitt') {
      const state: VideoStartState = { videoStartFiles: files };
      void navigate('/studio/ki-schnitt', { state });
      return;
    }
    const state: VideoStartState = {
      videoStartFiles: [files[0]],
      openInEditor: current.id === 'editor',
    };
    void navigate('/studio/video', { state });
  };

  return (
    <div className="flex flex-col items-center gap-lg pt-xl">
      <div className="text-center">
        <h1 className="mb-xs text-4xl font-semibold text-foreground-heading max-md:text-2xl">
          Neues Video
        </h1>
        <p className="text-lg text-grey-500 dark:text-grey-400">{current.lead}</p>
      </div>

      <div
        role="radiogroup"
        aria-label="Wie möchtest du dein Video bearbeiten?"
        className="flex flex-wrap justify-center gap-xs"
      >
        {ways.map((w) => {
          const Icon = w.icon;
          const active = w.id === current.id;
          return (
            <button
              key={w.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setWay(w.id)}
              className={cn(
                'flex items-center gap-xs rounded-full border px-md py-xs font-medium transition-colors',
                active
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-grey-300 bg-white/70 text-foreground hover:border-primary-600 dark:border-grey-600 dark:bg-grey-900/70'
              )}
            >
              <Icon className="size-5" aria-hidden />
              {w.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div
          role="alert"
          className="flex w-full max-w-[600px] items-center justify-between gap-md rounded-lg border border-red-600 bg-red-50 p-md text-red-600 dark:bg-grey-800"
        >
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => setError(null)}>
            Schließen
          </Button>
        </div>
      )}

      <div className="w-full max-w-[600px]">
        {current.id === 'ki-schnitt' ? (
          <UploadZone
            key="ki"
            onFilesSelected={go}
            accept={KI_ACCEPT}
            multiple
            maxSizeMB={3 * 1024}
            icon={<PiMagicWand className="size-8" />}
            title="Videos auswählen oder hierher ziehen"
            subtitle="Auch mehrere Takes, Bilder und Musik"
            onError={setError}
          />
        ) : (
          <UploadZone
            key="video"
            onFileSelected={(file) => go([file])}
            accept={VIDEO_ACCEPT}
            maxSizeMB={500}
            icon={<current.icon className="size-8" />}
            title="Video auswählen oder hierher ziehen"
            subtitle="MP4, MOV, AVI, MKV, WebM — bis 500 MB"
            onError={setError}
          />
        )}
      </div>

      {current.id === 'editor' && (
        <Link to="/studio/videoeditor" className="text-sm underline underline-offset-2">
          Ohne Video starten: leeres Projekt öffnen
        </Link>
      )}
    </div>
  );
}

export default function VideoStartPage() {
  return (
    <ErrorBoundary>
      <PageContainer gradient bgClassName={getToolGradient('reels-untertitel')}>
        <VideoStart />
      </PageContainer>
    </ErrorBoundary>
  );
}
