import { getContractsClient } from '@gruenerator/shared/api';
import { buildNotebookSlug } from '@gruenerator/shared/utils';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';

import { NotebookHubShell } from './hub/NotebookHub';

const NEW_NOTEBOOK_NAME = 'Unbenanntes Notebook';

/**
 * „Neues Notebook" legt sofort ein leeres Notebook an und öffnet es im Hub —
 * Anlegen und Bearbeiten sind dieselbe Fläche. Der Ref-Riegel verhindert, dass
 * StrictMode (oder ein zweiter Effektlauf) zwei Notebooks anlegt.
 */
function NotebookCreatePageInner() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  const create = useCallback(async () => {
    setFailed(false);
    try {
      const result = await getContractsClient().notebookCollections.createCollection({
        body: { name: NEW_NOTEBOOK_NAME },
      });
      if (result.status !== 201) throw new Error(`HTTP ${result.status}`);
      const created = result.body.collection;
      const slug = created.slug_suffix
        ? buildNotebookSlug(created.name, created.slug_suffix)
        : created.id;
      void queryClient.invalidateQueries({ queryKey: ['notebookCollections'] });
      void navigate(`/notebooks/${slug}/bearbeiten?neu=1`, { replace: true });
    } catch {
      setFailed(true);
    }
  }, [navigate, queryClient]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void create();
  }, [create]);

  if (!failed) {
    return (
      <p role="status" className="mt-2xl text-center text-sm text-grey-500">
        Notebook wird angelegt…
      </p>
    );
  }
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Notebook konnte nicht angelegt werden</EmptyTitle>
        <EmptyDescription>Bitte versuche es noch einmal.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => void create()}>Erneut versuchen</Button>
      </EmptyContent>
    </Empty>
  );
}

function NotebookEditPageInner() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  if (!id) return null;
  return <NotebookHubShell key={id} slugOrId={id} isNew={params.get('neu') === '1'} />;
}

export const NotebookCreatePage = withAuthRequired(NotebookCreatePageInner, {
  title: 'Notebook erstellen',
});

export const NotebookEditPage = withAuthRequired(NotebookEditPageInner, {
  title: 'Notebook bearbeiten',
});

export default NotebookEditPage;
