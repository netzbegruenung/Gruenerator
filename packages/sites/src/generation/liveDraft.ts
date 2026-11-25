import {
  DEFAULT_SITE_HEADER_STYLE,
  DEFAULT_SITE_VARIANT,
  type SiteBlock,
  type SiteContentDraft,
  type SiteDraft,
  type WebsiteContent,
} from '@gruenerator/contracts';

import { transformAiResponse } from './transform';

/** The draft with every missing field empty, so the page builder can take it. */
function fill(draft: SiteContentDraft): WebsiteContent {
  return {
    hero: { heading: draft.hero?.heading ?? '', text: draft.hero?.text ?? '' },
    about: { title: draft.about?.title ?? '', content: draft.about?.content ?? '' },
    hero_image: {
      title: draft.hero_image?.title ?? '',
      subtitle: draft.hero_image?.subtitle ?? '',
      imageUrl: draft.hero_image?.imageUrl ?? '',
    },
    themes: (draft.themes ?? []).map((theme) => ({
      title: theme.title ?? '',
      content: theme.content ?? '',
      imageUrl: theme.imageUrl ?? '',
    })),
    // No link while writing: the draft never carries one (see siteContentDraftSchema).
    actions: (draft.actions ?? []).map((action) => ({
      text: action.text ?? '',
      link: '',
      imageUrl: action.imageUrl ?? '',
    })),
    contact: {
      title: draft.contact?.title ?? '',
      email: '',
      backgroundImageUrl: draft.contact?.backgroundImageUrl ?? '',
    },
  };
}

/**
 * Ids by role, not random: a new draft arrives every ~150 ms, and fresh ids
 * would remount every block on each one. The live page is never stored, so
 * these ids never meet the real ones the created site gets.
 */
function withStableIds(block: SiteBlock): SiteBlock {
  const id = `live-${block.type}`;
  if (block.type === 'themes') {
    return { ...block, id, items: block.items.map((item, i) => ({ ...item, id: `${id}-${i}` })) };
  }
  if (block.type === 'actions') {
    return { ...block, id, items: block.items.map((item, i) => ({ ...item, id: `${id}-${i}` })) };
  }
  return { ...block, id };
}

/**
 * The page as far as the model has written it, built the way the finished
 * content will be (`transformAiResponse`), so the preview shows the same blocks
 * the editor opens with.
 */
export function liveSiteDraft(draft: SiteContentDraft, contactEmail: string): SiteDraft {
  const page = transformAiResponse(fill(draft), () => 'live');
  return {
    site_title: page.site_title,
    tagline: page.tagline,
    profile_image: '',
    variant: DEFAULT_SITE_VARIANT,
    header: DEFAULT_SITE_HEADER_STYLE,
    contact_email: contactEmail,
    contact_phone: '',
    social_links: {},
    blocks: page.sections.blocks.map(withStableIds),
  };
}
