import {
  type MarketplaceItem,
  type MarketplaceKind,
  type MarketplaceListResponse,
  type MarketplaceSection,
} from '@gruenerator/contracts';

const REPORT_KIND = {
  agent: 'user_agent',
  recipe: 'user_text_form',
  template: 'user_template',
  sticker: 'studio_asset',
  background: 'studio_asset',
  notebook: 'notebook',
} as const;

const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** A Marktplatz item as the API sends it; official content cannot be reported. */
export function item(
  kind: MarketplaceKind,
  title: string,
  over: Partial<Omit<MarketplaceItem, 'kind'>> = {}
): MarketplaceItem {
  const ref = over.ref ?? `${kind}-${slug(title)}`;
  const origin = over.origin ?? 'oeffentlich';
  const base = {
    key: `${kind}:${ref}`,
    ref,
    origin,
    title,
    description: null,
    thumbnailUrl: null,
    iconKey: null,
    authorName: null,
    audience: 'all' as const,
    likesCount: 0,
    liked: false,
    saved: false,
    isOwn: false,
    reportKind: origin === 'oeffentlich' ? REPORT_KIND[kind] : null,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...over,
  };
  switch (kind) {
    case 'agent':
      return {
        ...base,
        kind,
        agent: { identifier: `gruenerator-${slug(title)}`, slug: 'presse', isUserAgent: false },
      };
    case 'recipe':
      return {
        ...base,
        kind,
        recipe: { mention: slug(title), rowId: null, skillCategory: null, system: false },
      };
    case 'template':
      return {
        ...base,
        kind,
        template: {
          templateType: 'canva',
          thumbUrl: null,
          externalUrl: `https://canva.com/${ref}`,
          images: [],
          categories: [],
          tags: [],
          contentData: {},
          metadata: {},
        },
      };
    case 'sticker':
    case 'background':
      return {
        ...base,
        kind,
        asset: {
          id: '0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10',
          kind,
          title,
          tags: [],
          src: '/api/share/0123456789abcdef0123456789abcdef/download',
          thumbUrl: null,
          width: 512,
          height: 256,
          source: 'upload',
          visibility: 'public',
          audience: 'all',
          moderation: 'ok',
          isOfficial: false,
          isOwn: false,
          authorName: base.authorName,
          likesCount: base.likesCount,
          liked: base.liked,
          favorited: base.saved,
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      };
    case 'notebook':
      return { ...base, kind, notebook: { slug: `${slug(title)}-Ab3xK9` } };
  }
}

export const sectionsResponse = (sections: MarketplaceSection[]): MarketplaceListResponse => ({
  sections,
});
