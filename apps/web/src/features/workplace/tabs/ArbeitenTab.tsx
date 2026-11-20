import { Suspense, lazy } from 'react';

import PageContainer from '../../../components/common/PageContainer';
import { DocsHome } from '../../docs/DocsPage';
import { AppsNewsletterSection } from '../components/AppsNewsletterSection';
import {
  BriefingSection,
  MEDIA_GRID,
  MEDIA_TOOLS,
  MarketplaceSection,
  ToolCardsSection,
} from '../components/ArbeitenSections';
import { InfoTilesSection } from '../components/InfoTilesSection';
import { NewContentMenu } from '../components/NewContentMenu';
// "Grünerators Favoriten" (externe Dienste) sind vorerst ausgeblendet — zum
// Reaktivieren `FavoritesSection` aus `../components/ToolsSection` importieren
// und als eigenen Abschnitt einblenden.

// Pulls image-studio Lightbox + ShareMediaModal — keep it off the tab's
// critical path.
const RecentlyCreatedSection = lazy(() => import('../components/RecentlyCreatedSection'));

// "Arbeiten": composer on top, then one column of sections on a shared grid —
// Zuletzt, Mach mehr mit deinem Grünerator, Grünerator Briefing, Marktplatz, Apps & Newsletter.
const ArbeitenTab = () => {
  return (
    // Phones start right under the tab bar: the greeting is hidden there (see DocsHome),
    // so „Zuletzt" sits 16 px into the scroll area, ~26 px below the tab pill.
    <PageContainer maxWidth="lg" noPadTop gradient={false} className="max-md:pt-0">
      <div data-tour="arbeiten-create">
        <DocsHome />
      </div>

      <div className="mt-lg flex flex-col gap-10 pb-2xl max-md:mt-4 md:gap-12 lg:gap-14">
        <div data-tour="arbeiten-recents">
          <Suspense fallback={null}>
            <RecentlyCreatedSection headerAction={<NewContentMenu />} />
          </Suspense>
        </div>
        <ToolCardsSection
          title="Mach mehr mit deinem Grünerator"
          tools={MEDIA_TOOLS}
          gridClassName={MEDIA_GRID}
          data-tour="arbeiten-tools"
        />
        <BriefingSection />
        <MarketplaceSection />
        <AppsNewsletterSection />
        <InfoTilesSection />
      </div>
    </PageContainer>
  );
};

export default ArbeitenTab;
