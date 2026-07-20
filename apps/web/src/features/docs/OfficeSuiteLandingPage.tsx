import { DocsProvider } from '@gruenerator/docs';

import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { getToolGradient } from '../../config/toolTheme';

import { webAppDocsAdapter } from './docsAdapter';
import { DocumentsContent } from './DocsPage';

/**
 * "/office" — the Office hub, modelled on CanvasLandingPage (/studio): the
 * unscoped office composer + recents engine (DocumentsContent) with a
 * "Neu erstellen" strip (Leeres Dokument/Board/Tabelle/Slides) between the
 * composer and the recents feed. This replaces the former per-type overview
 * pages (/docs, /boards, /sheets, /presentations, which now redirect here).
 * Route-level RequireAuth gates access, so no auth wrapper is needed here.
 */
export default function OfficeSuiteLandingPage() {
  return (
    <ErrorBoundary>
      <PageContainer maxWidth="lg" noPadTop bgClassName={getToolGradient('office')}>
        <DocsProvider adapter={webAppDocsAdapter}>
          <DocumentsContent showRecents officeToolStrip heroTitle="Dein Office" />
        </DocsProvider>
      </PageContainer>
    </ErrorBoundary>
  );
}
