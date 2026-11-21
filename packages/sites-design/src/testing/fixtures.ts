import {
  type PublishedSiteSnapshot,
  publishedSiteSnapshotSchema,
  type SiteBlock,
  type SiteBlockOf,
  type SiteBlockType,
  type SupportedLocale,
} from '@gruenerator/contracts';

const IMAGE = '/api/share/abcdef123/preview';

const doc = (...content: unknown[]) => ({ type: 'doc', content });
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const heading = (text: string) => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text }],
});

const legal = {
  name: 'Max Muster',
  street: 'Musterstraße 1',
  postal_code: '10115',
  city: 'Berlin',
  email: 'max@example.org',
  phone: '+49 30 123456',
};

function themeItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i + 1}`,
    imageUrl: IMAGE,
    title: `Thema ${i + 1}`,
    content: doc(paragraph(`Text zu Thema ${i + 1}`)),
  }));
}

/** The snapshot with the first block of `type` patched. */
export function withBlock<T extends SiteBlockType>(
  snapshot: PublishedSiteSnapshot,
  type: T,
  patch: Partial<SiteBlockOf<T>>
): PublishedSiteSnapshot {
  let done = false;
  const blocks = snapshot.sections.blocks.map((block) => {
    if (done || block.type !== type) return block;
    done = true;
    return { ...block, ...patch } as SiteBlock;
  });
  return { ...snapshot, sections: { ...snapshot.sections, blocks } };
}

/** The snapshot without its blocks of `type`, as a published page leaves out a hidden block. */
export function withoutBlock(
  snapshot: PublishedSiteSnapshot,
  type: SiteBlockType
): PublishedSiteSnapshot {
  return withBlocks(
    snapshot,
    snapshot.sections.blocks.filter((block) => block.type !== type)
  );
}

/** The snapshot with its blocks replaced. */
export function withBlocks(
  snapshot: PublishedSiteSnapshot,
  blocks: SiteBlock[]
): PublishedSiteSnapshot {
  return { ...snapshot, sections: { ...snapshot.sections, blocks } };
}

function parse(input: unknown): PublishedSiteSnapshot {
  return publishedSiteSnapshotSchema.parse(input);
}

export function fullSnapshot(
  overrides: Partial<PublishedSiteSnapshot> = {}
): PublishedSiteSnapshot {
  return parse({
    version: 2,
    locale: 'de-DE',
    site_title: 'Max Muster',
    tagline: 'Für ein lebenswertes Berlin',
    profile_image: IMAGE,
    contact_email: 'max@example.org',
    contact_phone: '+49 30 123456',
    social_links: {
      instagram: 'https://instagram.com/max.muster',
      facebook: 'https://facebook.com/max.muster',
      twitter: 'https://x.com/max_muster',
      linkedin: 'https://linkedin.com/in/max-muster',
      mastodon: 'https://gruene.social/@max',
      youtube: 'https://youtube.com/@max',
    },
    sections: {
      blocks: [
        { id: 'hero', type: 'hero' },
        {
          id: 'about',
          type: 'about',
          title: 'Über mich',
          content: doc(heading('Mein Weg'), paragraph('Ich bin seit zehn Jahren aktiv.')),
        },
        {
          id: 'banner',
          type: 'heroImage',
          imageUrl: IMAGE,
          title: 'Zusammen für Berlin',
          subtitle: 'Gemeinsam anpacken',
        },
        { id: 'themes', type: 'themes', items: themeItems(3) },
        {
          id: 'actions',
          type: 'actions',
          items: [
            { id: 'a1', imageUrl: IMAGE, text: 'Kontakt aufnehmen', link: '#kontakt' },
            {
              id: 'a2',
              imageUrl: IMAGE,
              text: 'Mitglied werden',
              link: 'https://gruene.de/mitmachen',
            },
            { id: 'a3', imageUrl: IMAGE, text: 'Spenden', link: 'https://gruene.de/spenden' },
          ],
        },
        {
          id: 'feed',
          type: 'socialFeed',
          title: 'Instagram',
          instagramUsername: 'max.muster',
        },
        { id: 'contact', type: 'contact', title: 'Kontakt', backgroundImageUrl: IMAGE },
      ],
    },
    legal,
    variant: 'dunkel',
    ...overrides,
  });
}

export function minimalSnapshot(locale: SupportedLocale = 'de-DE'): PublishedSiteSnapshot {
  return parse({
    version: 2,
    locale,
    site_title: 'Anna Beispiel',
    tagline: '',
    profile_image: '',
    contact_email: '',
    contact_phone: '',
    social_links: {},
    sections: { blocks: [{ id: 'hero', type: 'hero' }] },
    legal: { ...legal, name: 'Anna Beispiel', email: 'anna@example.org' },
  });
}

export function maxSnapshot(): PublishedSiteSnapshot {
  const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
  const base = fullSnapshot();
  return parse({
    ...base,
    site_title: 'W'.repeat(120),
    contact_email: email,
    legal: { ...legal, email },
    sections: {
      blocks: base.sections.blocks.map((block) =>
        block.type === 'themes'
          ? { ...block, items: themeItems(6) }
          : block.type === 'actions'
            ? {
                ...block,
                items: [1, 2, 3, 4, 5, 6].map((n) => ({
                  id: `a${n}`,
                  imageUrl: IMAGE,
                  text: `Aktion ${n}`,
                  link: 'https://gruene.de/mitmachen',
                })),
              }
            : block
      ),
    },
  });
}
