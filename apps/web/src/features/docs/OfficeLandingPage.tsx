import { DocsProvider } from '@gruenerator/docs';

import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { getToolGradient } from '../../config/toolTheme';

import { webAppDocsAdapter } from './docsAdapter';
import { DocumentsContent, type OfficeScope } from './DocsPage';

// Each office scope shares its colour identity (tile + page gradient) with the
// matching tool tile on the Arbeiten tab, via the shared toolTheme registry.
const SCOPE_TOOL_ID: Record<OfficeScope, string> = {
  doc: 'docs',
  board: 'boards',
  sheet: 'sheets',
  pres: 'presentations',
};

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
      <PageContainer maxWidth="lg" noPadTop bgClassName={getToolGradient(SCOPE_TOOL_ID[scope])}>
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
