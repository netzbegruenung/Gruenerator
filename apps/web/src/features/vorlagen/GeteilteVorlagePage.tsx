import { type SharedTemplate } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { Button } from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { HiOutlineTemplate } from 'react-icons/hi';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import PageContainer from '@/components/common/PageContainer';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useAuth } from '@/hooks/useAuth';
import { buildLoginUrl } from '@/utils/authRedirect';

type LoadState =
  { kind: 'ok'; template: SharedTemplate } | { kind: 'needs_login' } | { kind: 'gone' };

/**
 * Landing page for a Vorlage shared by link — the target of the URL the share
 * dialog hands out.
 *
 * Deliberately NOT the canvas editor: a link visitor should see what the
 * Vorlage looks like and be offered their own copy, not be dropped into an
 * editor for someone else's frozen snapshot. Public routes are opt-in
 * (`public: true` in routes.ts), so this component must survive having no
 * session at all — hence the explicit `needs_login` branch instead of an
 * auth guard.
 */
function GeteilteVorlageContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [cloning, setCloning] = useState(false);

  const { data, isLoading } = useQuery<LoadState>({
    queryKey: ['shared-vorlage', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await getContractsClient().sharedTemplate.getShared({ params: { id: id! } });
      if (res.status === 200) return { kind: 'ok', template: res.body.data };
      if (res.status === 401) return { kind: 'needs_login' };
      return { kind: 'gone' };
    },
  });

  const use = useCallback(async () => {
    if (!data || data.kind !== 'ok' || cloning) return;
    if (!isAuthenticated) {
      // Cloning mints a document that needs an owner, so the copy step is the
      // one place a public link still requires an account.
      window.location.href = buildLoginUrl(window.location.pathname);
      return;
    }
    setCloning(true);
    try {
      const res = await getContractsClient().canvas.clone({
        params: { id: data.template.canvas_id },
        body: {},
      });
      if (res.status !== 201) throw new Error(`HTTP ${res.status}`);
      void navigate(`/studio/canvas/${res.body.newCanvasId}`);
    } catch (e) {
      toast.error(
        'Vorlage konnte nicht kopiert werden: ' + (e instanceof Error ? e.message : String(e))
      );
      setCloning(false);
    }
  }, [cloning, data, isAuthenticated, navigate]);

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-3xl">
        <div className="size-6 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
      </div>
    );
  }

  if (data.kind !== 'ok') {
    const needsLogin = data.kind === 'needs_login';
    return (
      <div className="mx-auto max-w-[480px] rounded-lg border border-dashed border-grey-200 px-6 py-12 text-center dark:border-grey-700">
        <div className="mb-4 flex justify-center">
          <div className="flex size-12 items-center justify-center rounded-lg bg-background-alt text-foreground">
            <HiOutlineTemplate className="size-6" />
          </div>
        </div>
        <h1 className="text-lg font-medium text-foreground-heading">
          {needsLogin ? 'Anmeldung nötig' : 'Vorlage nicht verfügbar'}
        </h1>
        <p className="mx-auto mt-2 text-sm leading-relaxed text-foreground opacity-70">
          {needsLogin
            ? 'Diese Vorlage wurde nur für angemeldete Menschen geteilt.'
            : 'Dieser Link führt ins Leere — die Vorlage wurde gelöscht oder nicht mehr geteilt.'}
        </p>
        {needsLogin && (
          <Button
            variant="brand"
            size="brand"
            className="mt-6"
            onClick={() => (window.location.href = buildLoginUrl(window.location.pathname))}
          >
            Anmelden
          </Button>
        )}
      </div>
    );
  }

  const { template } = data;

  return (
    <div className="mx-auto max-w-[560px] pt-md">
      <h1 className="mb-xs text-3xl font-semibold text-foreground-heading max-md:text-2xl">
        {template.title}
      </h1>
      <p className="mb-lg text-sm text-foreground opacity-70">
        {template.shared_by ? `Geteilt von ${template.shared_by}` : 'Geteilte Vorlage'}
      </p>

      {template.preview_image_url && (
        <img
          src={template.preview_image_url}
          alt={`Vorschau der Vorlage „${template.title}“`}
          className="mb-lg w-full rounded-lg border border-grey-200 dark:border-grey-700"
        />
      )}

      {template.description && (
        <p className="mb-lg text-foreground opacity-80">{template.description}</p>
      )}

      <Button variant="brand" size="brand" onClick={() => void use()} disabled={cloning}>
        {cloning ? 'Kopie wird erstellt…' : 'Vorlage verwenden'}
      </Button>
      <p className="mt-2 text-xs text-grey-500">
        Du bekommst eine eigene, bearbeitbare Kopie. Das Original bleibt unverändert.
      </p>
    </div>
  );
}

const GeteilteVorlagePage = () => (
  <ErrorBoundary>
    <PageContainer maxWidth="lg">
      <GeteilteVorlageContent />
    </PageContainer>
  </ErrorBoundary>
);

export default GeteilteVorlagePage;
