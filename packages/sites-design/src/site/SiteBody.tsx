/** @jsxRuntime automatic @jsxImportSource react */
import { Fragment, type ReactNode } from 'react';

import { type PublishedSiteSnapshot, type SiteSectionId } from '@gruenerator/contracts';

import { siteCopy } from '../model/copy.js';
import { type SiteLinks } from '../model/paths.js';
import { type SiteRenderMode, visibleSections } from '../model/visibility.js';

import { type SectionContext, type SiteEditSlots } from './layout.js';
import { AboutSection } from './sections/AboutSection.js';
import { ActionsSection } from './sections/ActionsSection.js';
import { ContactSection } from './sections/ContactSection.js';
import { HeroImageSection } from './sections/HeroImageSection.js';
import { HeroSection } from './sections/HeroSection.js';
import { SocialFeedSection } from './sections/SocialFeedSection.js';
import { ThemesSection } from './sections/ThemesSection.js';
import { SiteFooter } from './SiteFooter.js';
import { SiteHeader } from './SiteHeader.js';

export const SKIP_LINK =
  'site:sr-only site:focus:not-sr-only site:focus:fixed site:focus:top-3 site:focus:left-3 site:focus:z-50 site:focus:inline-flex site:focus:min-h-11 site:focus:items-center site:focus:rounded-pill site:focus:bg-ground site:focus:px-5 site:focus:font-[700] site:focus:text-link site:focus-visible:outline-offset-[-6px]';

export function SiteShell({
  snapshot,
  links,
  visible,
  backHome,
  children,
}: {
  snapshot: PublishedSiteSnapshot;
  links: SiteLinks;
  visible: readonly SiteSectionId[];
  backHome: string | null;
  children: ReactNode;
}) {
  const copy = siteCopy(snapshot.locale);
  return (
    <div data-ground="paper" className="site:flex site:min-h-dvh site:flex-col">
      <a href="#inhalt" data-ground="paper" className={SKIP_LINK}>
        {copy.skipLink}
      </a>
      <SiteHeader snapshot={snapshot} visible={visible} backHome={backHome} />
      <main id="inhalt" tabIndex={-1} className="site:grow site:outline-none">
        {children}
      </main>
      <SiteFooter snapshot={snapshot} links={links} />
    </div>
  );
}

export function SiteBody({
  snapshot,
  links,
  mode,
  renderInstagram,
  edit,
}: {
  snapshot: PublishedSiteSnapshot;
  links: SiteLinks;
  mode: SiteRenderMode;
  renderInstagram?: (username: string) => ReactNode;
  edit?: SiteEditSlots;
}) {
  const visible = visibleSections(snapshot, mode);
  const ctx: SectionContext = {
    snapshot,
    mode,
    copy: siteCopy(snapshot.locale),
    visible,
    edit: edit ?? null,
  };
  const render: Record<SiteSectionId, () => ReactNode> = {
    hero: () => <HeroSection ctx={ctx} />,
    about: () => <AboutSection ctx={ctx} />,
    heroImage: () => <HeroImageSection ctx={ctx} />,
    themes: () => <ThemesSection ctx={ctx} />,
    actions: () => <ActionsSection ctx={ctx} />,
    socialFeed: () => <SocialFeedSection ctx={ctx} renderInstagram={renderInstagram ?? null} />,
    contact: () => <ContactSection ctx={ctx} />,
  };

  return (
    <SiteShell snapshot={snapshot} links={links} visible={visible} backHome={null}>
      {visible.map((id) => (
        <Fragment key={id}>{render[id]()}</Fragment>
      ))}
    </SiteShell>
  );
}
