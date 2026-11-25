import { type SiteBlockType } from '@gruenerator/contracts';
import { type ReactNode } from 'react';

import { AboutSectionEditor } from '../../components/editor/sections/AboutSectionEditor';
import { ActionsSectionEditor } from '../../components/editor/sections/ActionsSectionEditor';
import { ContactSectionEditor } from '../../components/editor/sections/ContactSectionEditor';
import { HeroImageSectionEditor } from '../../components/editor/sections/HeroImageSectionEditor';
import { HeroSectionEditor } from '../../components/editor/sections/HeroSectionEditor';
import { SocialFeedSectionEditor } from '../../components/editor/sections/SocialFeedSectionEditor';
import { ThemesSectionEditor } from '../../components/editor/sections/ThemesSectionEditor';
import { useDraft } from '../../draft/SiteDraftContext';

import { BlockBackgroundField } from './BlockBackgroundField';

const FORMS: Record<SiteBlockType, (props: { blockId: string }) => ReactNode> = {
  hero: HeroSectionEditor,
  about: AboutSectionEditor,
  heroImage: HeroImageSectionEditor,
  themes: ThemesSectionEditor,
  actions: ActionsSectionEditor,
  socialFeed: SocialFeedSectionEditor,
  contact: ContactSectionEditor,
};

/**
 * The form of one block, without a frame: everything about it that is not text on the page
 * (links, networks, Instagram, card details, its background). The element panel and the sidebar
 * both host it.
 */
export function BlockForm({ blockId }: { blockId: string }) {
  const type = useDraft((d) => d.blocks.find((block) => block.id === blockId)?.type ?? null);
  if (!type) return null;
  const Form = FORMS[type];
  return (
    <>
      <Form blockId={blockId} />
      <BlockBackgroundField blockId={blockId} />
    </>
  );
}
