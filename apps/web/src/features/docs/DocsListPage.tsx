import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { DocsProvider, DocumentList, ErrorBoundary } from '@gruenerator/docs';

import '@gruenerator/docs/styles';
import { webAppDocsAdapter } from './docsAdapter';

export default function DocsListPage() {
  return (
    <MantineProvider>
      <DocsProvider adapter={webAppDocsAdapter}>
        <ErrorBoundary>
          <DocumentList />
        </ErrorBoundary>
      </DocsProvider>
    </MantineProvider>
  );
}
