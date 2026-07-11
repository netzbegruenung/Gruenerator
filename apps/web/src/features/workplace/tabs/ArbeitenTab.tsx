import { Suspense, lazy } from 'react';

import PageContainer from '../../../components/common/PageContainer';
import { useAuthStore } from '../../../stores/authStore';
import { DocsHome } from '../../docs/DocsPage';
import StudioGallerySections from '../../image-studio/components/StudioGallerySections';
import ToolsSection, { FavoritesSection } from '../components/ToolsSection';

// Pulls image-studio Lightbox + ShareMediaModal — keep it off the tab's
// critical path.
const RecentlyCreatedSection = lazy(() => import('../components/RecentlyCreatedSection'));

// "Arbeiten": the office start page (docs/boards/sheets/presentations), the
// cross-content "Zuletzt" feed, the studio gallery and the tools grid.
const ArbeitenTab = () => {
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';

  return (
    <PageContainer maxWidth="lg" noPadTop className="max-md:pt-lg">
      <DocsHome />

      <div className="mt-2xl">
        <Suspense fallback={null}>
          <RecentlyCreatedSection />
        </Suspense>
      </div>

      <div className="mt-2xl">
        <StudioGallerySections />
      </div>

      <section className="mb-xl">
        <ToolsSection />
      </section>

      {!isAustrian && (
        <section className="mb-xl">
          <FavoritesSection />
        </section>
      )}
    </PageContainer>
  );
};

export default ArbeitenTab;
