import {
  type PublishedSiteSnapshot,
  publishedSiteSnapshotSchema,
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

function parse(input: unknown): PublishedSiteSnapshot {
  return publishedSiteSnapshotSchema.parse(input);
}

export function fullSnapshot(
  overrides: Partial<PublishedSiteSnapshot> = {}
): PublishedSiteSnapshot {
  return parse({
    version: 1,
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
      heroImage: { imageUrl: IMAGE, title: 'Zusammen für Berlin', subtitle: 'Gemeinsam anpacken' },
      about: {
        title: 'Über mich',
        content: doc(heading('Mein Weg'), paragraph('Ich bin seit zehn Jahren aktiv.')),
      },
      themes: [1, 2, 3].map((n) => ({
        imageUrl: IMAGE,
        title: `Thema ${n}`,
        content: doc(paragraph(`Text zu Thema ${n}`)),
      })),
      actions: [
        { imageUrl: IMAGE, text: 'Kontakt aufnehmen', link: '#kontakt' },
        { imageUrl: IMAGE, text: 'Mitglied werden', link: 'https://gruene.de/mitmachen' },
        { imageUrl: IMAGE, text: 'Spenden', link: 'https://gruene.de/spenden' },
      ],
      contact: { title: 'Kontakt', backgroundImageUrl: IMAGE },
      socialFeed: { title: 'Instagram', instagramUsername: 'max.muster', showFeed: true },
    },
    legal,
    variant: 'dunkel',
    hidden_sections: [],
    ...overrides,
  });
}

export function minimalSnapshot(locale: SupportedLocale = 'de-DE'): PublishedSiteSnapshot {
  return parse({
    version: 1,
    locale,
    site_title: 'Anna Beispiel',
    tagline: '',
    profile_image: '',
    contact_email: '',
    contact_phone: '',
    social_links: {},
    sections: {},
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
      ...base.sections,
      themes: [1, 2, 3, 4, 5, 6].map((n) => ({
        imageUrl: IMAGE,
        title: `Thema ${n}`,
        content: doc(paragraph(`Text zu Thema ${n}`)),
      })),
      actions: [1, 2, 3, 4, 5, 6].map((n) => ({
        imageUrl: IMAGE,
        text: `Aktion ${n}`,
        link: 'https://gruene.de/mitmachen',
      })),
    },
  });
}
