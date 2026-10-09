import { type ExplainableDto } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { Button, Skeleton } from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import { FileDown } from 'lucide-react';
import { type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { explainableImageUrl, type ExplainableAccess } from './explainableUrls';
import { ExplainableView } from './ExplainableView';
import { useExplainablePdf } from './useExplainablePdf';

import ErrorBoundary from '@/components/ErrorBoundary';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';
import { buildLoginUrl } from '@/utils/authRedirect';

type LoadState =
  { kind: 'ok'; explainable: ExplainableDto } | { kind: 'needs_login' } | { kind: 'gone' };

function Notice({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="mx-auto mt-3xl max-w-[480px] rounded-lg border border-dashed border-grey-200 px-6 py-12 text-center dark:border-grey-700">
      <h1 className="text-lg font-medium text-foreground-heading">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-grey-500">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

function SharedExplainable({ explainable, token }: { explainable: ExplainableDto; token: string }) {
  const access: ExplainableAccess = { kind: 'shared', token };
  const pdf = useExplainablePdf(access, explainable.title);

  return (
    <ExplainableView
      content={explainable.content}
      imageUrl={(i) => explainableImageUrl(access, i)}
      actions={
        <Button
          variant="brand-outline"
          size="sm"
          onClick={() => void pdf.download()}
          disabled={pdf.isDownloading}
        >
          <FileDown aria-hidden="true" />
          {pdf.isDownloading ? 'PDF wird erstellt …' : 'Als PDF herunterladen'}
        </Button>
      }
    />
  );
}

function PublicExplainableBody() {
  const { token = '' } = useParams<{ token: string }>();

  const { data, isLoading } = useQuery<LoadState>({
    queryKey: ['explainable-shared', token],
    enabled: !!token,
    queryFn: async () => {
      const res = await getContractsClient().publicExplainables.getShared({ params: { token } });
      if (res.status === 200) return { kind: 'ok', explainable: res.body };
      if (res.status === 401) return { kind: 'needs_login' };
      return { kind: 'gone' };
    },
    refetchInterval: (query) => {
      const d = query.state.data;
      return d?.kind === 'ok' && d.explainable.status === 'images_pending' ? 2000 : false;
    },
  });

  useDocumentTitle(data?.kind === 'ok' ? data.explainable.title : null);

  if (isLoading || !data) {
    return (
      <div aria-busy="true" className="mx-auto mt-3xl w-full max-w-[68ch]">
        <span className="sr-only">Explainable wird geladen …</span>
        <Skeleton className="mb-md h-10 w-3/4" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (data.kind === 'needs_login') {
    return (
      <Notice
        title="Anmeldung nötig"
        text="Dieses Explainable wurde nur für angemeldete Menschen geteilt. Melde dich an, um es zu lesen."
        action={
          <Button
            variant="brand"
            size="brand"
            onClick={() =>
              (window.location.href = buildLoginUrl(
                window.location.pathname + window.location.search
              ))
            }
          >
            Anmelden
          </Button>
        }
      />
    );
  }

  if (data.kind === 'gone') {
    return <Notice title="Nicht verfügbar" text="Dieses Explainable ist nicht (mehr) geteilt." />;
  }

  return <SharedExplainable explainable={data.explainable} token={token} />;
}

/** Target of the share link `/e/<token>`; must work without a session. */
const PublicExplainablePage = () => (
  <ErrorBoundary>
    <div className="min-h-dvh bg-background px-md pb-2xl pt-lg md:px-lg">
      <div className="mx-auto mb-xl flex w-full max-w-[68ch] items-center justify-between">
        <Link
          to="/"
          className="text-sm font-semibold text-primary-600 hover:underline dark:text-primary-300"
        >
          Erstellt mit dem Grünerator
        </Link>
      </div>
      <PublicExplainableBody />
    </div>
  </ErrorBoundary>
);

export default PublicExplainablePage;
