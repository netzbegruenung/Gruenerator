import {
  type PublishedSiteSnapshot,
  richTextDocFromPlainText,
  type SiteBlockOf,
  type SiteBlockType,
  type SiteVariant,
  type SupportedLocale,
} from '@gruenerator/contracts';

// A card shows the block at about a quarter of its width, so 400px is plenty. Inside the 1200px
// preview frame the srcset would pick 800px or more; a fixed size skips it (`sizedSrc`).
const stock = (file: string): string => `/api/image-picker/stock-image/${file}?w=400&fmt=webp`;

export type SampleBlockType = Exclude<SiteBlockType, 'hero'>;

const SAMPLES: { [K in SampleBlockType]: SiteBlockOf<K> } = {
  about: {
    id: 'beispiel',
    type: 'about',
    title: 'Wer ich bin',
    content: richTextDocFromPlainText(
      'Ich bin 34, Fahrradmechaniker und wohne seit zwölf Jahren hier. In meinem Viertel fehlen sichere Schulwege, Bänke im Park und ein Bus nach 22 Uhr.\n\nSeit drei Jahren sitze ich im Ortsbeirat. Dort habe ich gelernt, wie viel gute Ideen bewegen, wenn genug Leute mitziehen.'
    ),
  },
  heroImage: {
    id: 'beispiel',
    type: 'heroImage',
    imageUrl: stock('mike-marrah-vKNjdRBqep0-unsplash.jpg'),
    title: 'Gemeinsam für eine nachhaltige Zukunft!',
    subtitle: 'Am Wahltag zählt jede Stimme.',
  },
  themes: {
    id: 'beispiel',
    type: 'themes',
    items: [
      {
        id: 'beispiel-1',
        title: 'Klimaschutz vor Ort',
        imageUrl: stock('diogo-ferrer-Ue8fAd5DXnY-unsplash.jpg'),
        content: richTextDocFromPlainText('Solar auf jedes Dach der Stadt.'),
      },
      {
        id: 'beispiel-2',
        title: 'Bezahlbar wohnen',
        imageUrl: stock('tobias-wilden-4453DIQWtsQ-unsplash.jpg'),
        content: richTextDocFromPlainText('Mehr Genossenschaften, weniger Leerstand.'),
      },
      {
        id: 'beispiel-3',
        title: 'Bus & Bahn',
        imageUrl: stock('gabriele-romano-2CL0bDDWxpE-unsplash.jpg'),
        content: richTextDocFromPlainText('Alle zehn Minuten, auch am Abend.'),
      },
    ],
  },
  actions: {
    id: 'beispiel',
    type: 'actions',
    items: [
      {
        id: 'beispiel-1',
        text: 'Mitmachen',
        link: '#kontakt',
        imageUrl: stock('colin-lloyd-gcfvs__17dw-unsplash.jpg'),
      },
      {
        id: 'beispiel-2',
        text: 'Infostand besuchen',
        link: '#kontakt',
        imageUrl: stock('inigo-de-la-maza-s285sDw5Ikc-unsplash.jpg'),
      },
      {
        id: 'beispiel-3',
        text: 'Ins Gespräch kommen',
        link: '#kontakt',
        imageUrl: stock('zion-c-p07RGfScf3c-unsplash.jpg'),
      },
    ],
  },
  socialFeed: {
    id: 'beispiel',
    type: 'socialFeed',
    title: 'Instagram',
    instagramUsername: 'die_gruenen',
  },
  contact: { id: 'beispiel', type: 'contact', title: 'Kontakt', backgroundImageUrl: '' },
};

/**
 * The page a block picker card shows: one example block of `type` in the site's variant and
 * locale, with example contact details, so the card shows the block filled in rather than its
 * empty placeholders. Nothing of the user's own page goes in, so typing never re-renders it.
 */
export function sampleBlockSnapshot(
  type: SampleBlockType,
  locale: SupportedLocale,
  variant: SiteVariant
): PublishedSiteSnapshot {
  return {
    version: 2,
    locale,
    variant,
    site_title: 'Beispiel',
    tagline: '',
    profile_image: '',
    contact_email: 'hallo@example.org',
    contact_phone: locale === 'de-AT' ? '+43 316 123456' : '+49 431 123456',
    social_links: {
      instagram: 'https://instagram.com/die_gruenen',
      mastodon: 'https://gruene.social/@gruene',
    },
    sections: { blocks: [SAMPLES[type]] },
    legal: { name: '', street: '', postal_code: '', city: '', email: '' },
  };
}
