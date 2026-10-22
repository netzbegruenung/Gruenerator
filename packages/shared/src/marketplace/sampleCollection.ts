import { type MarketplaceItem } from '@gruenerator/contracts';

/**
 * The entries of the sample collection „Wahlkampf für Moritz“: Vorlagen,
 * Hintergründe and Sticker that exist only as files under
 * `/images/marketplace/collections/wahlkampf/`, not as rows. They show what a
 * campaign kit looks like; nobody can like, save or report them, so the web
 * client opens their picture instead of a detail (`isSampleItem`).
 */
const DIR = '/images/marketplace/collections/wahlkampf';
const SAMPLE_REF_PREFIX = 'muster-';
const CREATED = '2026-10-21T00:00:00.000Z';

const base = (ref: string, title: string, description: string | null) => ({
  ref: `${SAMPLE_REF_PREFIX}${ref}`,
  origin: 'oeffentlich' as const,
  title,
  description,
  iconKey: null,
  authorName: 'Muster',
  audience: 'all' as const,
  likesCount: 0,
  liked: false,
  saved: false,
  isOwn: false,
  reportKind: null,
  createdAt: CREATED,
});

const vorlage = (file: string, title: string, description: string): MarketplaceItem => ({
  ...base(file, title, description),
  key: `template:${SAMPLE_REF_PREFIX}${file}`,
  kind: 'template',
  thumbnailUrl: `${DIR}/${file}-v1-480.webp`,
  template: {
    templateType: 'canva',
    thumbUrl: null,
    externalUrl: null,
    images: [{ url: `${DIR}/${file}-v1-960.webp`, title, thumbUrl: null }],
    categories: [],
    tags: [],
    contentData: {},
    metadata: {},
  },
});

const asset = (
  kind: 'sticker' | 'background',
  file: string,
  title: string,
  src: string,
  thumb: string,
  size: number
): MarketplaceItem => {
  const ref = `${SAMPLE_REF_PREFIX}${file}`;
  return {
    ...base(file, title, null),
    key: `${kind}:${ref}`,
    kind,
    thumbnailUrl: thumb,
    asset: {
      id: ref,
      kind,
      title,
      tags: [],
      src,
      thumbUrl: thumb,
      width: size,
      height: size,
      source: kind === 'sticker' ? 'cutout' : 'upload',
      visibility: 'public',
      audience: 'all',
      moderation: 'ok',
      isOfficial: false,
      isOwn: false,
      authorName: 'Muster',
      likesCount: 0,
      liked: false,
      favorited: false,
      createdAt: CREATED,
    },
  };
};

const background = (file: string, title: string) =>
  asset(
    'background',
    file,
    title,
    `${DIR}/${file}-v1-1024.webp`,
    `${DIR}/${file}-v1-640.webp`,
    1024
  );
const sticker = (file: string, title: string) =>
  asset('sticker', file, title, `${DIR}/${file}-v1-512.webp`, `${DIR}/${file}-v1-512.webp`, 512);

export const WAHLKAMPF_SAMPLES: readonly MarketplaceItem[] = [
  vorlage(
    'vorlage-plakat',
    'Plakat „Mutig für unsere Stadt“',
    'Wahlplakat mit Foto, Slogan und Wahltermin.'
  ),
  vorlage(
    'vorlage-sharepic',
    'Sharepic „Mehr Grün für jede Straße“',
    'Quadratisches Sharepic mit Balken-Headline.'
  ),
  vorlage(
    'vorlage-story',
    'Story „Komm zum Infostand!“',
    'Hochformat für Instagram mit Ort und Uhrzeit.'
  ),
  vorlage(
    'vorlage-flyer',
    'Flyer „Drei Dinge, die Moritz anpackt“',
    'Flyer mit drei nummerierten Vorhaben.'
  ),
  background('hintergrund-marktplatz', 'Marktplatz am Morgen'),
  background('hintergrund-wiese', 'Blumenwiese'),
  background('hintergrund-sonnenblumen', 'Sonnenblumenfeld'),
  sticker('sticker-sonnenblume', 'Sonnenblume'),
  sticker('sticker-megafon', 'Megafon'),
  sticker('sticker-herz', 'Herz-Sprechblase'),
];

/** Entries that exist only as files: no likes, no saving, no detail page. */
export function isSampleItem(item: Pick<MarketplaceItem, 'ref'>): boolean {
  return item.ref.startsWith(SAMPLE_REF_PREFIX);
}

/** The picture a sample entry opens instead of a detail. */
export function sampleImageOf(item: MarketplaceItem): string | null {
  if (item.kind === 'template') return item.template.images[0]?.url ?? item.thumbnailUrl;
  if (item.kind === 'sticker' || item.kind === 'background') return item.asset.src;
  return null;
}
