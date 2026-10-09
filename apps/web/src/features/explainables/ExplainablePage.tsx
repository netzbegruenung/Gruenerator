import { type ExplainableDto, type ExplainableShareMode } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { extractSlugSuffix } from '@gruenerator/shared/utils';
import { Button, ConfirmDialogProvider, Skeleton, useConfirm } from '@gruenerator/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, Link2, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import {
  explainableImageUrl,
  explainableShareUrl,
  type ExplainableAccess,
} from './explainableUrls';
import { ExplainableView } from './ExplainableView';
import { useExplainablePdf } from './useExplainablePdf';

import PageContainer from '@/components/common/PageContainer';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';
import { getPublicAppOrigin } from '@/utils/platform';
import { copyToClipboard } from '@/utils/shareUtils';

const SHARE_OPTIONS: ReadonlyArray<{ value: ExplainableShareMode; label: string }> = [
  { value: 'private', label: 'Privat' },
  { value: 'authenticated', label: 'Angemeldete mit Link' },
  { value: 'public', label: 'Öffentlicher Link' },
];

const selectCls =
  'h-9 rounded-sm border-0 bg-input-bg px-sm text-sm text-input-text outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60';

const explainableQueryKey = (ref: string) => ['explainable', ref] as const;

function ExplainableToolbar({
  explainable,
  queryKey,
}: {
  explainable: ExplainableDto;
  queryKey: readonly unknown[];
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const selectId = useId();
  const access: ExplainableAccess = { kind: 'owner', id: explainable.id };
  const pdf = useExplainablePdf(access, explainable.title);

  const share = useMutation({
    mutationFn: async (shareMode: ExplainableShareMode) => {
      const res = await getContractsClient().explainables.updateShare({
        params: { id: explainable.id },
        body: { shareMode },
      });
      if (res.status !== 200) throw new ApiError(res.status, `HTTP ${res.status}`);
      return res.body;
    },
    onSuccess: (body) => {
      queryClient.setQueryData<ExplainableDto | null>(queryKey, (prev) =>
        prev ? { ...prev, shareMode: body.shareMode, shareToken: body.shareToken } : prev
      );
    },
    onError: () => toast.error('Die Freigabe konnte nicht geändert werden.'),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const res = await getContractsClient().explainables.remove({
        params: { id: explainable.id },
      });
      if (res.status !== 200) throw new ApiError(res.status, `HTTP ${res.status}`);
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey });
      toast.success('Explainable in den Papierkorb verschoben.');
      // `default` = this page was the entry point, so there is no "back" to go to.
      if (location.key !== 'default') void navigate(-1);
      else void navigate('/chat', { replace: true });
    },
    onError: () => toast.error('Das Explainable konnte nicht gelöscht werden.'),
  });

  const changeShareMode = async (next: ExplainableShareMode) => {
    if (next === explainable.shareMode) return;
    if (next === 'public') {
      const ok = await confirm({
        title: 'Öffentlich teilen?',
        description:
          'Inhalte dieses Explainables sind dann für alle mit dem Link sichtbar – auch ohne Anmeldung.',
        confirmLabel: 'Öffentlich teilen',
        variant: 'default',
      });
      if (!ok) return;
    }
    share.mutate(next);
  };

  const copyLink = async () => {
    if (!explainable.shareToken) return;
    try {
      await copyToClipboard(explainableShareUrl(getPublicAppOrigin(), explainable.shareToken));
      toast.success('Link kopiert');
    } catch {
      toast.error('Der Link konnte nicht kopiert werden.');
    }
  };

  const deleteExplainable = async () => {
    const ok = await confirm({
      title: 'Explainable löschen?',
      description: 'Es kommt in den Papierkorb und lässt sich dort 30 Tage lang wiederherstellen.',
      confirmLabel: 'Löschen',
    });
    if (ok) remove.mutate();
  };

  const canCopy = explainable.shareMode !== 'private' && !!explainable.shareToken;

  return (
    <div className="flex flex-wrap items-center gap-sm">
      <div className="flex items-center gap-xs">
        <label htmlFor={selectId} className="text-sm font-medium text-grey-500">
          Teilen
        </label>
        <select
          id={selectId}
          className={selectCls}
          value={explainable.shareMode}
          disabled={share.isPending}
          onChange={(e) => void changeShareMode(e.target.value as ExplainableShareMode)}
        >
          {SHARE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {canCopy && (
        <Button variant="brand-outline" size="sm" onClick={() => void copyLink()}>
          <Link2 aria-hidden="true" />
          Link kopieren
        </Button>
      )}
      <Button
        variant="brand-outline"
        size="sm"
        onClick={() => void pdf.download()}
        disabled={pdf.isDownloading}
      >
        <FileDown aria-hidden="true" />
        {pdf.isDownloading ? 'PDF wird erstellt …' : 'Als PDF herunterladen'}
      </Button>
      <Button
        variant="brand-ghost"
        size="sm"
        onClick={() => void deleteExplainable()}
        disabled={remove.isPending}
      >
        <Trash2 aria-hidden="true" />
        Löschen
      </Button>
    </div>
  );
}

function LoadingState() {
  return (
    <div aria-busy="true" className="mx-auto w-full max-w-[68ch]">
      <span className="sr-only">Explainable wird geladen …</span>
      <Skeleton className="mb-md h-10 w-3/4" />
      <Skeleton className="mb-xl h-20 w-full" />
      <Skeleton className="mb-md h-6 w-1/2" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="mx-auto max-w-[480px] rounded-lg border border-dashed border-grey-200 px-6 py-12 text-center dark:border-grey-700">
      <h1 className="text-lg font-medium text-foreground-heading">Explainable nicht gefunden</h1>
      <p className="mt-2 text-sm leading-relaxed text-grey-500">
        Dieses Explainable gibt es nicht (mehr). Vielleicht liegt es im Papierkorb.
      </p>
      <div className="mt-6 flex justify-center gap-sm">
        <Button variant="brand-outline" size="brand" asChild>
          <Link to="/papierkorb">Zum Papierkorb</Link>
        </Button>
        <Button variant="brand" size="brand" asChild>
          <Link to="/chat">Zum Chat</Link>
        </Button>
      </div>
    </div>
  );
}

function ExplainableBody() {
  const { slug = '' } = useParams<{ slug: string }>();
  const ref = extractSlugSuffix(slug) ?? slug;
  const queryKey = explainableQueryKey(ref);

  const { data, isLoading, isError } = useQuery({
    queryKey,
    enabled: !!ref,
    queryFn: async (): Promise<ExplainableDto | null> => {
      const res = await getContractsClient().explainables.get({ params: { ref } });
      if (res.status === 200) return res.body;
      if (res.status === 404) return null;
      throw new ApiError(res.status, `HTTP ${res.status}`);
    },
    // Images arrive in the background; poll until the server says they're done.
    refetchInterval: (query) => (query.state.data?.status === 'images_pending' ? 2000 : false),
  });

  useDocumentTitle(data ? `${data.title} – Grünerator` : null);

  if (isLoading) return <LoadingState />;
  if (isError) {
    return (
      <p role="alert" className="mx-auto max-w-[68ch] text-center text-grey-500">
        Das Explainable konnte nicht geladen werden. Bitte lade die Seite neu.
      </p>
    );
  }
  if (!data) return <NotFoundState />;

  const access: ExplainableAccess = { kind: 'owner', id: data.id };
  return (
    <ExplainableView
      content={data.content}
      imageUrl={(i) => explainableImageUrl(access, i)}
      actions={<ExplainableToolbar explainable={data} queryKey={queryKey} />}
    />
  );
}

const ExplainablePage = () => (
  <ErrorBoundary>
    <ConfirmDialogProvider>
      <PageContainer maxWidth="sm" gradient={false}>
        <ExplainableBody />
      </PageContainer>
    </ConfirmDialogProvider>
  </ErrorBoundary>
);

export default ExplainablePage;
