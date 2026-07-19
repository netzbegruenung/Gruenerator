import { Suspense, lazy } from 'react';

import PageContainer from '../../../components/common/PageContainer';
import { DocsHome } from '../../docs/DocsPage';
import { OfficeSection } from '../components/ToolsSection';
// "Grünerators Favoriten" (externe Dienste) sind vorerst ausgeblendet — zum
// Reaktivieren `FavoritesSection` wieder importieren und den Block unten einblenden.

// Pulls image-studio Lightbox + ShareMediaModal — keep it off the tab's
// critical path.
const RecentlyCreatedSection = lazy(() => import('../components/RecentlyCreatedSection'));

// "Arbeiten": the office start page (composer + Vorlagen incl. sharepics),
// ONE recents feed (the workplace "Zuletzt" — docs, boards, sharepics, canvas,
// reels and texts all in one), and the tools grid.
const ArbeitenTab = () => {
  return (
    <PageContainer maxWidth="lg" noPadTop gradient={false} className="max-md:pt-lg">
      <div data-tour="arbeiten-create">
        <DocsHome />
      </div>

      <section className="mb-xl mt-2xl" data-tour="arbeiten-tools">
        <OfficeSection />
      </section>

      <div data-tour="arbeiten-recents">
        <Suspense fallback={null}>
          <RecentlyCreatedSection />
        </Suspense>
      </div>

      {/* Grünerators Favoriten vorerst ausgeblendet:
      {!isAustrian && (
        <section className="mb-xl">
          <FavoritesSection />
        </section>
      )} */}
    </PageContainer>
  );
};

export default ArbeitenTab;
