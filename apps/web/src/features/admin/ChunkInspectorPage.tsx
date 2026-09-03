import { SectionHeader } from '@gruenerator/ui';
import { useParams, useSearchParams } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';

import { ChunkInspectorView } from './chunk-inspector/ChunkInspectorView';
import RequireAdmin from './components/RequireAdmin';

/**
 * `/admin/chunks/:documentId?collection=…` — was der Abruf zu einem Dokument
 * gespeichert hat (#3123). Die Seite ist nur die Hülle; der Inhalt liegt in
 * `ChunkInspectorView`, damit er ohne Router und ohne Auth-Store testbar bleibt.
 */
const ChunkInspectorPage = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const [searchParams] = useSearchParams();
  const collection = searchParams.get('collection') ?? '';
  const offsetParam = Number(searchParams.get('offset'));
  const initialOffset = Number.isInteger(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

  return (
    <RequireAdmin type="instanceAdmin">
      <ErrorBoundary>
        <PageContainer maxWidth="lg">
          <div className="mb-lg pt-md">
            <h1 className="mb-xs text-3xl font-semibold text-foreground-heading">
              Chunk-Inspektor
            </h1>
            <p className="m-0 text-lg text-grey-500 dark:text-grey-400">
              Was der Abruf zu diesem Dokument gespeichert hat — die Chunks in ihrer Reihenfolge,
              mit den Feldern, die im Punkt liegen. Leere Felder sind nicht berechnet worden,
              sondern nicht gespeichert.
            </p>
          </div>
          <SectionHeader title="Gespeicherte Chunks" />
          {documentId && collection ? (
            <ChunkInspectorView
              documentId={documentId}
              collection={collection}
              initialOffset={initialOffset}
            />
          ) : (
            <p className="py-lg text-center text-sm text-grey-500 dark:text-grey-400">
              Ohne <code>?collection=…</code> ist nicht bestimmbar, in welcher Sammlung das Dokument
              liegt.
            </p>
          )}
        </PageContainer>
      </ErrorBoundary>
    </RequireAdmin>
  );
};

export default withAuthRequired(ChunkInspectorPage, {
  title: 'Chunk-Inspektor',
});
