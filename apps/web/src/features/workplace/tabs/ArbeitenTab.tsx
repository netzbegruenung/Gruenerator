import { Suspense, lazy } from 'react';

import PageContainer from '../../../components/common/PageContainer';
import { DocsHome } from '../../docs/DocsPage';
import { NewContentMenu } from '../../docs/NewContentMenu';
import {
  BriefingSection,
  MEDIA_TOOLS,
  MORE_TOOLS,
  MarketplaceSection,
  NotebooksSection,
  ToolCardsSection,
} from '../components/ArbeitenSections';
// "Grünerators Favoriten" (externe Dienste) sind vorerst ausgeblendet — zum
// Reaktivieren `FavoritesSection` aus `../components/ToolsSection` importieren
// und als eigenen Abschnitt einblenden.

// Pulls image-studio Lightbox + ShareMediaModal — keep it off the tab's
// critical path.
const RecentlyCreatedSection = lazy(() => import('../components/RecentlyCreatedSection'));

// "Arbeiten": composer on top, then one column of sections on a shared grid —
// Zuletzt, Grünerator Briefing, Notebooks, Marktplatz, Bild & Video, Weitere Werkzeuge.
const ArbeitenTab = () => {
  return (
    <PageContainer maxWidth="lg" noPadTop gradient={false} className="max-md:pt-lg">
      <div data-tour="arbeiten-create">
        <DocsHome />
      </div>

      <div className="mt-lg flex flex-col gap-10 pb-2xl md:gap-12 lg:gap-14">
        <div data-tour="arbeiten-recents">
          <Suspense fallback={null}>
            <RecentlyCreatedSection headerAction={<NewContentMenu />} />
          </Suspense>
        </div>
        <BriefingSection />
        <NotebooksSection />
        <MarketplaceSection />
        <ToolCardsSection title="Bild & Video" tools={MEDIA_TOOLS} data-tour="arbeiten-tools" />
        <ToolCardsSection title="Weitere Werkzeuge" tools={MORE_TOOLS} />
      </div>
    </PageContainer>
  );
};

export default ArbeitenTab;
