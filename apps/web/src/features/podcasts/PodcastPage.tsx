import { type PodcastDto, type PodcastStatus } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { slugifyName } from '@gruenerator/shared/utils';
import { Button, Skeleton } from '@gruenerator/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Headphones, Link2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { PodcastPlayer } from './PodcastPlayer';
import { PodcastProgress } from './PodcastProgress';

import PageContainer from '@/components/common/PageContainer';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';
import apiClient from '@/components/utils/apiClient';
import { downloadBlob } from '@/utils/downloadFile';
import { formatAudioDuration } from '@/utils/formatAudioDuration';
import { getPublicAppOrigin } from '@/utils/platform';
import { copyToClipboard } from '@/utils/shareUtils';

const baseURL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

export const podcastQueryKey = (id: string) => ['podcasts', id] as const;

const SPEAKER_LABEL = { a: 'Moderation', b: 'Erklärung' } as const;

function isPending(
  status: PodcastStatus | undefined
): status is 'queued' | 'scripting' | 'voicing' {
  return status === 'queued' || status === 'scripting' || status === 'voicing';
}

function FailedState({ podcast }: { podcast: PodcastDto }) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: async () => {
      const res = await getContractsClient().podcasts.retry({ params: { id: podcast.id } });
      if (res.status !== 202) throw new ApiError(res.status, `HTTP ${res.status}`);
    },
    onSuccess: () => {
      queryClient.setQueryData<PodcastDto | null>(podcastQueryKey(podcast.id), (prev) =>
        prev ? { ...prev, status: prev.script ? 'voicing' : 'queued', error: null } : prev
      );
    },
    onError: () => toast.error('Der Podcast konnte nicht neu gestartet werden.'),
  });

  return (
    <div
      role="alert"
      className="rounded-xl border border-dashed border-grey-200 px-md py-lg text-center dark:border-grey-700"
    >
      <p className="text-base font-medium text-foreground-heading">Das hat nicht geklappt</p>
      <p className="mt-xs text-sm text-grey-500">
        {podcast.error ?? 'Der Podcast konnte nicht erstellt werden.'}
      </p>
      <Button
        variant="brand"
        size="brand"
        className="mt-md"
        onClick={() => retry.mutate()}
        disabled={retry.isPending}
      >
        <RefreshCw aria-hidden="true" />
        Neu versuchen
      </Button>
    </div>
  );
}

function ReadyState({ podcast, shareToken }: { podcast: PodcastDto; shareToken: string }) {
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const response = await apiClient.get<Blob>(`/share/${shareToken}/download`, {
        responseType: 'blob',
      });
      await downloadBlob(response.data, `${slugifyName(podcast.title, 'podcast')}.mp3`);
    } catch {
      toast.error('Der Download ist fehlgeschlagen. Die Datei liegt weiterhin in der Mediathek.');
    } finally {
      setDownloading(false);
    }
  };

  const copyLink = async () => {
    try {
      await copyToClipboard(`${getPublicAppOrigin()}/share/${shareToken}`);
      toast.success('Link kopiert');
    } catch {
      toast.error('Der Link konnte nicht kopiert werden.');
    }
  };

  return (
    <>
      <PodcastPlayer
        src={`${baseURL}/share/${shareToken}/stream`}
        title={podcast.title}
        durationSeconds={podcast.durationSeconds}
      />

      <div className="mt-md flex flex-wrap items-center gap-sm">
        <Button
          variant="brand-outline"
          size="sm"
          onClick={() => void download()}
          disabled={downloading}
        >
          <Download aria-hidden="true" />
          {downloading ? 'Wird geladen …' : 'MP3 herunterladen'}
        </Button>
        <Button variant="brand-outline" size="sm" onClick={() => void copyLink()}>
          <Link2 aria-hidden="true" />
          Link kopieren
        </Button>
        <Button variant="brand-ghost" size="sm" asChild>
          <Link to="/media-library">In der Mediathek</Link>
        </Button>
      </div>
    </>
  );
}

function TranscriptSkeleton() {
  return (
    <section aria-hidden="true" className="mt-xl">
      <Skeleton className="h-6 w-32" />
      <div className="mt-md flex flex-col gap-md">
        {[0.9, 0.75, 0.85, 0.6].map((w, i) => (
          <div key={i} className={i % 2 ? 'pl-md' : ''}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-xs h-4" style={{ width: `${w * 100}%` }} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Transcript({ podcast }: { podcast: PodcastDto }) {
  if (!podcast.script) return isPending(podcast.status) ? <TranscriptSkeleton /> : null;
  return (
    <section aria-labelledby="podcast-transcript" className="mt-xl">
      <h2 id="podcast-transcript" className="text-lg font-semibold text-foreground-heading">
        Transkript
      </h2>
      <ol className="mt-md flex flex-col gap-md">
        {podcast.script.turns.map((turn, i) => (
          <li key={i} className={turn.speaker === 'b' ? 'pl-md' : ''}>
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary-600">
              {SPEAKER_LABEL[turn.speaker]}
            </p>
            <p className="mt-0.5 text-base leading-relaxed text-foreground">{turn.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function LoadingState() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Podcast wird geladen …</span>
      <Skeleton className="mb-md h-10 w-3/4" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="mx-auto max-w-[480px] rounded-lg border border-dashed border-grey-200 px-6 py-12 text-center dark:border-grey-700">
      <h1 className="text-lg font-medium text-foreground-heading">Podcast nicht gefunden</h1>
      <p className="mt-2 text-sm leading-relaxed text-grey-500">Diesen Podcast gibt es nicht.</p>
      <div className="mt-6 flex justify-center">
        <Button variant="brand" size="brand" asChild>
          <Link to="/chat">Zum Chat</Link>
        </Button>
      </div>
    </div>
  );
}

function PodcastBody() {
  const { id = '' } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: podcastQueryKey(id),
    enabled: !!id,
    queryFn: async (): Promise<PodcastDto | null> => {
      const res = await getContractsClient().podcasts.get({ params: { id } });
      if (res.status === 200) return res.body;
      if (res.status === 404) return null;
      throw new ApiError(res.status, `HTTP ${res.status}`);
    },
    // The worker writes and voices in the background; poll until it is done.
    refetchInterval: (query) => (isPending(query.state.data?.status) ? 2000 : false),
  });

  // Until the script exists, the title is only the answer's opening words — the
  // script names the episode.
  const title =
    data && !data.script && isPending(data.status) ? 'Dein Podcast entsteht' : data?.title;
  useDocumentTitle(title ? `${title} – Podcast – Grünerator` : null);

  if (isLoading) return <LoadingState />;
  if (isError) {
    return (
      <p role="alert" className="text-center text-grey-500">
        Der Podcast konnte nicht geladen werden. Bitte lade die Seite neu.
      </p>
    );
  }
  if (!data) return <NotFoundState />;

  return (
    <article>
      <header className="mb-lg">
        <p className="flex items-center gap-xs text-sm font-medium text-secondary-600">
          <Headphones className="h-4 w-4" aria-hidden="true" />
          Podcast
        </p>
        <h1 className="mt-xs text-2xl font-semibold leading-tight text-foreground-heading sm:text-3xl">
          {title}
        </h1>
        <p className="mt-xs flex flex-wrap items-center gap-x-sm text-sm text-grey-500">
          {data.durationSeconds ? (
            <span>{formatAudioDuration(data.durationSeconds)} Min.</span>
          ) : null}
          <span>Zwei KI-Stimmen</span>
        </p>
      </header>

      {isPending(data.status) && (
        <PodcastProgress status={data.status} createdAt={data.createdAt} />
      )}
      {data.status === 'failed' && <FailedState podcast={data} />}
      {data.status === 'ready' &&
        (data.shareToken ? (
          <ReadyState podcast={data} shareToken={data.shareToken} />
        ) : (
          <p className="rounded-xl bg-background-alt px-md py-lg text-center text-sm text-grey-500">
            Die Audiodatei wurde in der Mediathek gelöscht. Das Transkript bleibt hier erhalten.
          </p>
        ))}

      <Transcript podcast={data} />
    </article>
  );
}

const PodcastPage = () => (
  <ErrorBoundary>
    <PageContainer maxWidth="sm" gradient={false}>
      <PodcastBody />
    </PageContainer>
  </ErrorBoundary>
);

export default PodcastPage;
