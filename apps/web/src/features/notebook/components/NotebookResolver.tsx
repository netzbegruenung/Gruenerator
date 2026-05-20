import { extractSlugSuffix } from '@gruenerator/shared/utils';
import { useParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { getNotebookConfigBySlug } from '../config/notebookPagesConfig';
import { useNotebookResolver } from '../hooks/useNotebookResolver';

import { DynamicNotebookPage, NotebookPageContent } from './NotebookPage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function NotebookResolverPage() {
  const { idOrSlug } = useParams<{ idOrSlug: string }>();

  // System-notebook lookup runs synchronously off a hardcoded config — covers
  // `/notebooks/bayern`, `/notebooks/grundsatz`, etc. with zero latency.
  const slugConfig = idOrSlug ? getNotebookConfigBySlug(idOrSlug) : null;
  const isUuid = !!idOrSlug && UUID_RE.test(idOrSlug);
  const hasSlugSuffix = !!idOrSlug && extractSlugSuffix(idOrSlug) !== null;

  // Only hit the backend resolver for inputs that look like a user-notebook
  // slug AND aren't already a known system slug or a raw UUID. Anything else
  // is either handled locally or genuinely unknown.
  const resolverQuery = useNotebookResolver(
    idOrSlug ?? '',
    !!idOrSlug && !slugConfig && !isUuid && hasSlugSuffix
  );

  if (!idOrSlug) {
    return (
      <div className="flex flex-1 items-center justify-center p-md text-foreground-muted">
        <p>Kein Notebook ausgewählt.</p>
      </div>
    );
  }

  if (slugConfig) {
    return <NotebookPageContent config={slugConfig} />;
  }

  if (isUuid) {
    return <DynamicNotebookPage id={idOrSlug} />;
  }

  if (hasSlugSuffix) {
    if (resolverQuery.isPending) {
      return (
        <div className="flex flex-1 items-center justify-center p-md text-foreground-muted">
          <p>Notebook wird geladen…</p>
        </div>
      );
    }
    if (resolverQuery.data) {
      return <DynamicNotebookPage id={resolverQuery.data.id} />;
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-sm p-md text-foreground-muted">
      <p>Notebook &quot;{idOrSlug}&quot; nicht gefunden.</p>
    </div>
  );
}

export const NotebookResolver = withAuthRequired(NotebookResolverPage, {
  title: 'Notebook',
});
