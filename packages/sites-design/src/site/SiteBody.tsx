/** @jsxRuntime automatic @jsxImportSource react */
import { Fragment, type ReactNode } from 'react';

import { type PublishedSiteSnapshot, type SiteBlock } from '@gruenerator/contracts';

import { siteCopy } from '../model/copy.js';
import { type SiteLinks } from '../model/paths.js';
import { blockGrounds } from '../model/grounds.js';
import { blockAnchors, type SiteRenderMode, visibleBlocks } from '../model/visibility.js';

import { type Placement, type SectionContext, type SiteEditSlots } from './layout.js';
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
  visible: readonly SiteBlock[];
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
  const blocks = visibleBlocks(snapshot, mode, Boolean(edit));
  const shown = blocks.filter((block) => !block.hidden);
  const anchors = blockAnchors(blocks);
  const grounds = blockGrounds(
    blocks,
    snapshot.variant,
    snapshot.locale,
    snapshot.profile_image !== ''
  );
  const ctx: SectionContext = {
    snapshot,
    mode,
    copy: siteCopy(snapshot.locale),
    blocks,
    liveAnchors: shown.map((block) => `#${anchors.get(block.id)}`),
    edit: edit ?? null,
  };
  const seen = new Set<string>();
  const place = (block: SiteBlock): Placement => {
    const first = !seen.has(block.type);
    seen.add(block.type);
    return {
      block,
      anchor: anchors.get(block.id) ?? block.id,
      ground: grounds.get(block.id) ?? 'paper',
      first,
    };
  };

  return (
    <SiteShell snapshot={snapshot} links={links} visible={shown} backHome={null}>
      {blocks.map((block) => (
        <Fragment key={block.id}>
          {renderBlock(ctx, place(block), renderInstagram ?? null)}
        </Fragment>
      ))}
    </SiteShell>
  );
}

/**
 * One block on its own, without header and footer, on the ground it takes as a page's first
 * block: the block picker's preview card. Static, never editable.
 */
export function SiteBlockPreview({ snapshot }: { snapshot: PublishedSiteSnapshot }) {
  const block = snapshot.sections.blocks[0];
  if (!block) return null;
  const blocks = [block];
  const anchor = blockAnchors(blocks).get(block.id) ?? block.id;
  const ctx: SectionContext = {
    snapshot,
    mode: 'preview',
    copy: siteCopy(snapshot.locale),
    blocks,
    liveAnchors: [`#${anchor}`],
    edit: null,
  };
  const ground =
    blockGrounds(blocks, snapshot.variant, snapshot.locale, snapshot.profile_image !== '').get(
      block.id
    ) ?? 'paper';
  return (
    <div data-ground="paper">{renderBlock(ctx, { block, anchor, ground, first: true }, null)}</div>
  );
}

function renderBlock(
  ctx: SectionContext,
  place: Placement,
  renderInstagram: ((username: string) => ReactNode) | null
): ReactNode {
  // Narrowed per type; each section takes the placement of its own block type.
  switch (place.block.type) {
    case 'hero':
      return <HeroSection ctx={ctx} place={place as Placement<'hero'>} />;
    case 'about':
      return <AboutSection ctx={ctx} place={place as Placement<'about'>} />;
    case 'heroImage':
      return <HeroImageSection ctx={ctx} place={place as Placement<'heroImage'>} />;
    case 'themes':
      return <ThemesSection ctx={ctx} place={place as Placement<'themes'>} />;
    case 'actions':
      return <ActionsSection ctx={ctx} place={place as Placement<'actions'>} />;
    case 'socialFeed':
      return (
        <SocialFeedSection
          ctx={ctx}
          place={place as Placement<'socialFeed'>}
          renderInstagram={renderInstagram}
        />
      );
    case 'contact':
      return <ContactSection ctx={ctx} place={place as Placement<'contact'>} />;
  }
}
