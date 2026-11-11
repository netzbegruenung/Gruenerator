/**
 * /studio/ki-schnitt — like the reel Grünerator: drop the files, nothing else
 * to fill in. Videos become the cut (a clip in which hardly anything is said
 * turns into b-roll on its own), pictures can be shown, audio becomes music.
 * Below, the person's earlier KI-Schnitte.
 */
import { VIDEO_AI_LIMITS, videoAiTreeUnits } from '@gruenerator/contracts';
import { Button, UploadZone } from '@gruenerator/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Film, Image, Loader2, Music, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PiFilmSlate } from 'react-icons/pi';
import { Link, useNavigate } from 'react-router-dom';

import {
  createProject,
  defaultRole,
  listProjects,
  projectsQueryKey,
  STATUS_LABEL,
  uploadMaterial,
  type UploadedMaterial,
} from './videoAiApi';

import PageContainer from '@/components/common/PageContainer';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';
import { getToolGradient } from '@/config/toolTheme';

const ACCEPT = {
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

const ICON = { video: Film, image: Image, audio: Music } as const;

interface Pending {
  key: string;
  name: string;
  progress: number;
}

function EarlierProjects() {
  const { data } = useQuery({ queryKey: projectsQueryKey, queryFn: listProjects });
  if (!data || data.length === 0) return null;
  return (
    <section aria-labelledby="ki-schnitt-earlier" className="w-full max-w-[600px]">
      <h2 id="ki-schnitt-earlier" className="mb-xs text-lg font-semibold text-foreground-heading">
        Deine KI-Schnitte
      </h2>
      <ul className="divide-y divide-grey-200 rounded-xl bg-white/70 px-md dark:divide-grey-700 dark:bg-grey-900/70">
        {data.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-md py-xs">
            <Link
              to={`/studio/ki-schnitt/${p.slugSuffix}`}
              className="truncate font-medium underline-offset-2 hover:underline"
            >
              {p.title}
            </Link>
            <span className="shrink-0 text-sm text-grey-500">{STATUS_LABEL[p.status]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function KiSchnittNew() {
  useDocumentTitle('KI-Schnitt – Grünerator');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<UploadedMaterial[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);

  const upload = async (picked: File[]) => {
    setError(null);
    const queue = picked.map((f, i) => ({ file: f, key: `${Date.now()}-${i}-${f.name}` }));
    setPending((p) => [
      ...p,
      ...queue.map(({ file, key }) => ({ key, name: file.name, progress: 0 })),
    ]);
    for (const { file, key } of queue) {
      try {
        const material = await uploadMaterial(file, (progress) =>
          setPending((p) => p.map((x) => (x.key === key ? { ...x, progress } : x)))
        );
        setFiles((list) => [...list, material]);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : `„${file.name}“ konnte nicht hochgeladen werden.`
        );
      } finally {
        setPending((p) => p.filter((x) => x.key !== key));
      }
    }
  };

  const videos = files.filter((f) => f.mediaType === 'video');
  const seconds = videos.reduce((sum, f) => sum + (f.durationSeconds ?? 0), 0);
  const trees = videoAiTreeUnits(seconds) / 100;

  const start = useMutation({
    mutationFn: () =>
      createProject({
        inputs: files.map((f) => ({ mediaId: f.mediaId, role: defaultRole(f.mediaType) })),
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      void navigate(`/studio/ki-schnitt/${created.slugSuffix}`);
    },
    onError: (e) => setError(e.message),
  });

  return (
    <div className="flex flex-col items-center gap-lg pt-xl">
      <div className="text-center">
        <h1 className="mb-xs text-4xl font-semibold text-foreground-heading max-md:text-2xl">
          KI-Schnitt
        </h1>
        <p className="text-lg text-grey-500 dark:text-grey-400">
          Lade dein Rohmaterial hoch — die KI schneidet daraus ein Reel mit Untertiteln.
        </p>
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
        <UploadZone
          onFilesSelected={(picked) => void upload(picked)}
          accept={ACCEPT}
          multiple
          maxSizeMB={3 * 1024}
          icon={<PiFilmSlate className="size-8" />}
          title="Videos auswählen oder hierher ziehen"
          subtitle={`Auch mehrere Takes, Bilder und Musik — bis ${VIDEO_AI_LIMITS.maxFootageSeconds / 60} Minuten Video`}
          onError={setError}
        />
      </div>

      {(files.length > 0 || pending.length > 0) && (
        <ul className="w-full max-w-[600px] space-y-xs" aria-label="Hochgeladene Dateien">
          {files.map((f) => {
            const Icon = ICON[f.mediaType];
            return (
              <li
                key={f.mediaId}
                className="flex items-center gap-sm rounded-lg bg-white/70 px-md py-xs dark:bg-grey-900/70"
              >
                <Icon className="size-4 shrink-0 text-grey-500" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{f.title}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${f.title} entfernen`}
                  onClick={() => setFiles((list) => list.filter((x) => x.mediaId !== f.mediaId))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            );
          })}
          {pending.map((p) => (
            <li key={p.key} className="rounded-lg bg-white/70 px-md py-xs dark:bg-grey-900/70">
              <div className="flex justify-between text-sm">
                <span className="truncate">{p.name}</span>
                <span className="tabular-nums text-grey-500">{p.progress} %</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-grey-200 dark:bg-grey-700">
                <div
                  className="h-full rounded-full bg-primary-500 transition-all duration-300"
                  style={{ width: `${p.progress}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {videos.length > 0 && (
        <div className="flex flex-col items-center gap-xs">
          <Button
            size="lg"
            onClick={() => start.mutate()}
            disabled={pending.length > 0 || start.isPending}
          >
            {start.isPending && <Loader2 className="mr-xs size-4 animate-spin" aria-hidden />}
            Schnitt starten
          </Button>
          <p className="text-sm text-grey-500">
            Kostet {trees.toLocaleString('de-DE')} {trees === 1 ? 'Baum' : 'Bäume'} · Du bekommst
            eine Benachrichtigung, wenn er fertig ist.
          </p>
        </div>
      )}

      <EarlierProjects />
    </div>
  );
}

export default function KiSchnittNewPage() {
  return (
    <ErrorBoundary>
      <PageContainer gradient bgClassName={getToolGradient('reels-untertitel')}>
        <KiSchnittNew />
      </PageContainer>
    </ErrorBoundary>
  );
}
