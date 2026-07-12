import { Suspense, lazy } from 'react';

import PageContainer from '../../../components/common/PageContainer';
import { useAuthStore } from '../../../stores/authStore';
import { DocsHome } from '../../docs/DocsPage';
import ToolsSection, { FavoritesSection } from '../components/ToolsSection';

// Pulls image-studio Lightbox + ShareMediaModal — keep it off the tab's
// critical path.
const RecentlyCreatedSection = lazy(() => import('../components/RecentlyCreatedSection'));

// "Arbeiten": the office start page (composer + Vorlagen incl. sharepics),
// ONE recents feed (the workplace "Zuletzt" — docs, boards, sharepics, canvas,
// reels and texts all in one), and the tools grid.
const ArbeitenTab = () => {
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';

  return (
    <PageContainer maxWidth="lg" noPadTop className="max-md:pt-lg">
      <div data-tour="arbeiten-create">
        <DocsHome />
      </div>

      <div className="mt-2xl" data-tour="arbeiten-recents">
        <Suspense fallback={null}>
          <RecentlyCreatedSection />
        </Suspense>
      </div>

      <section className="mb-xl" data-tour="arbeiten-tools">
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
