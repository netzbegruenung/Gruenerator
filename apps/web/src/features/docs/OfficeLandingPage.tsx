import { DocsProvider } from '@gruenerator/docs';

import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';

import { webAppDocsAdapter } from './docsAdapter';
import { DocumentsContent, getScopeBgClassName, type OfficeScope } from './DocsPage';

/**
 * Standalone, type-scoped office landing page — the /docs, /boards, /sheets and
 * /presentations routes. Reuses the Arbeiten tab's DocumentsContent engine
 * (composer + templates + recents), filtered to a single content type, with its
 * own page chrome and a per-type background tint. Route-level RequireAuth gates
 * access, so no auth wrapper is needed here.
 */
function OfficeLandingPage({ scope }: { scope: OfficeScope }) {
  return (
    <ErrorBoundary>
      <PageContainer maxWidth="lg" noPadTop bgClassName={getScopeBgClassName(scope)}>
        <DocsProvider adapter={webAppDocsAdapter}>
          <DocumentsContent showRecents scope={scope} />
        </DocsProvider>
      </PageContainer>
    </ErrorBoundary>
  );
}

export const DocsLandingPage = () => <OfficeLandingPage scope="doc" />;
export const BoardsLandingPage = () => <OfficeLandingPage scope="board" />;
export const SheetsLandingPage = () => <OfficeLandingPage scope="sheet" />;
export const PresentationsLandingPage = () => <OfficeLandingPage scope="pres" />;
