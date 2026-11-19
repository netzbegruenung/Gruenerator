import {
  isRichTextDocEmpty,
  type PublishedSiteSnapshot,
  SITE_SECTION_IDS,
  type SiteSectionId,
} from '@gruenerator/contracts';

export type SiteRenderMode = 'public' | 'preview';

export const SECTION_ANCHORS: Record<SiteSectionId, string> = {
  hero: 'start',
  about: 'ueber-mich',
  heroImage: 'botschaft',
  themes: 'themen',
  actions: 'mitmachen',
  socialFeed: 'instagram',
  contact: 'kontakt',
};

export function isSectionEmpty(snapshot: PublishedSiteSnapshot, id: SiteSectionId): boolean {
  const { sections } = snapshot;
  switch (id) {
    case 'hero':
      return false;
    case 'about':
      return (
        !sections.about ||
        (sections.about.title.trim() === '' && isRichTextDocEmpty(sections.about.content))
      );
    case 'heroImage':
      return (
        !sections.heroImage ||
        (sections.heroImage.imageUrl === '' && sections.heroImage.title.trim() === '')
      );
    case 'themes':
      return !sections.themes || sections.themes.length === 0;
    case 'actions':
      return !sections.actions || sections.actions.length === 0;
    case 'socialFeed':
      return (
        !sections.socialFeed ||
        !sections.socialFeed.showFeed ||
        !sections.socialFeed.instagramUsername
      );
    case 'contact':
      return (
        snapshot.contact_email === '' &&
        snapshot.contact_phone === '' &&
        Object.keys(snapshot.social_links).length === 0
      );
  }
}

export function visibleSections(
  snapshot: PublishedSiteSnapshot,
  mode: SiteRenderMode
): SiteSectionId[] {
  return SITE_SECTION_IDS.filter((id) => {
    if (id === 'hero') return true;
    if ((snapshot.hidden_sections as readonly string[]).includes(id)) return false;
    if (id === 'socialFeed') {
      const feed = snapshot.sections.socialFeed;
      if (!feed || !feed.showFeed) return false;
    }
    return mode === 'preview' || !isSectionEmpty(snapshot, id);
  });
}
