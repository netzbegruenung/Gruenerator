import { Suspense, lazy } from 'react';

import PageContainer from '../../../components/common/PageContainer';
import { useStartLayout } from '../../../hooks/useStartLayout';
import { DocsHome } from '../../docs/DocsPage';
import { AppsNewsletterSection } from '../components/AppsNewsletterSection';
import {
  BriefingSection,
  MEDIA_GRID,
  MEDIA_TOOLS,
  ToolCardsSection,
} from '../components/ArbeitenSections';
import { InfoTilesSection } from '../components/InfoTilesSection';
import { NewContentMenu } from '../components/NewContentMenu';
import { StudioSection } from '../components/StudioSection';

import { OnePageStart } from './OnePageStart';

import { cn } from '@/utils/cn';
// "Grünerators Favoriten" (externe Dienste) sind vorerst ausgeblendet — zum
// Reaktivieren `FavoritesSection` aus `../components/ToolsSection` importieren
// und als eigenen Abschnitt einblenden.

// Pulls image-studio Lightbox + ShareMediaModal — keep it off the tab's
// critical path.
const RecentlyCreatedSection = lazy(() => import('../components/RecentlyCreatedSection'));

// "Arbeiten": a hero, then one column of sections on a shared grid — Zuletzt,
// Mach mehr mit deinem Grünerator, Apps & Newsletter, Grünerator Briefing, Studio.
// With tabs the hero is the greeting and search; on the one-page layout it is the
// chat greeting and composer (see OnePageStart).
const ArbeitenTab = () => {
  const onePage = useStartLayout() === 'combined';
  const recents = (
    <Suspense fallback={null}>
      <RecentlyCreatedSection headerAction={<NewContentMenu />} />
    </Suspense>
  );

  return (
    // Phones start right under the tab bar: the greeting is hidden there (see DocsHome),
    // so „Zuletzt" sits 16 px into the scroll area, ~26 px below the tab pill.
    <PageContainer maxWidth="lg" noPadTop gradient={false} className="max-md:pt-0">
      {onePage ? (
        <OnePageStart recents={recents} />
      ) : (
        <>
          <div data-tour="arbeiten-create">
            <DocsHome />
          </div>
          <div data-tour="arbeiten-recents" className="mt-lg max-md:mt-4">
            {recents}
          </div>
        </>
      )}

      <div
        className={cn(
          'mt-10 flex flex-col gap-10 pb-2xl md:mt-12 md:gap-12 lg:mt-14 lg:gap-14',
          // Room at the end for the composer docked on phones.
          onePage && 'max-md:mt-0 max-md:pt-6 max-md:pb-32'
        )}
      >
        <ToolCardsSection
          title="Mach mehr mit deinem Grünerator"
          tools={MEDIA_TOOLS}
          gridClassName={MEDIA_GRID}
          data-tour="arbeiten-tools"
        />
        <AppsNewsletterSection />
        <BriefingSection />
        <StudioSection />
        <InfoTilesSection />
      </div>
    </PageContainer>
  );
};

export default ArbeitenTab;
