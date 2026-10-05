import { extractSlugSuffix } from '@gruenerator/shared/utils';
import { useParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { getSystemNotebookConfig } from '../config/notebookPagesConfig';

import { DynamicNotebookPage, NotebookPageContent } from './NotebookPage';
import { NotebookTabs } from './NotebookTabs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function NotebookResolverPage() {
  const { idOrSlug } = useParams<{ idOrSlug: string }>();

  // System-notebook lookup runs synchronously off a hardcoded config — covers
  // `/notebooks/bayern`, `/notebooks/grundsatz`, etc. with zero latency.
  const slugConfig = idOrSlug ? (getSystemNotebookConfig(idOrSlug) ?? null) : null;
  const isUuid = !!idOrSlug && UUID_RE.test(idOrSlug);
  const hasSlugSuffix = !!idOrSlug && extractSlugSuffix(idOrSlug) !== null;

  if (!idOrSlug) {
    return (
      <div className="flex flex-1 items-center justify-center p-md text-foreground-muted">
        <p>Kein Notebook ausgewählt.</p>
      </div>
    );
  }

  if (slugConfig) {
    return (
      <>
        <NotebookTabs config={slugConfig} active="chat" />
        <NotebookPageContent config={slugConfig} withTabBar />
      </>
    );
  }

  // `getCollection` resolves a slug itself — no separate resolve round trip
  // before the page can start loading.
  if (isUuid || hasSlugSuffix) {
    return <DynamicNotebookPage id={idOrSlug} />;
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
