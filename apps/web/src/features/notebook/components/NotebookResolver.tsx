import { useParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { getNotebookConfigBySlug } from '../config/notebookPagesConfig';

import { DynamicNotebookPage, NotebookPageContent } from './NotebookPage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function NotebookResolverPage() {
  const { idOrSlug } = useParams<{ idOrSlug: string }>();

  if (!idOrSlug) {
    return (
      <div className="flex flex-1 items-center justify-center p-md text-foreground-muted">
        <p>Kein Notebook ausgewählt.</p>
      </div>
    );
  }

  const slugConfig = getNotebookConfigBySlug(idOrSlug);
  if (slugConfig) {
    return <NotebookPageContent config={slugConfig} />;
  }

  if (UUID_RE.test(idOrSlug)) {
    return <DynamicNotebookPage />;
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
