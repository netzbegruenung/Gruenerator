/**
 * Zod schemas for the candidate-site builder (/api/sites).
 *
 * `siteSectionsSchema` is the canonical shape of the `sections` jsonb column:
 * an OBJECT keyed by section name.
 */
import { z } from 'zod';

import { moderationStateSchema } from './contentReport.js';
import {
  boundedRichTextDoc,
  emptyRichTextDoc,
  getRichTextLength,
  type RichTextDoc,
  SITE_ABOUT_MAX_LENGTH,
  SITE_THEME_CONTENT_MAX_LENGTH,
} from './richtext.js';
import { localeSchema, type SupportedLocale } from './userProfile.js';

export const SITE_HANDLE_MIN = 3;
export const SITE_HANDLE_MAX = 30;
export const RESERVED_SITE_HANDLES: readonly string[] = [
  'www',
  'api',
  'admin',
  'app',
  'mail',
  'ftp',
  'blog',
  'shop',
  'test',
  'dev',
  'staging',
  'beta',
  'login',
  'sites',
  'static',
  'assets',
  'impressum',
  'datenschutz',
  'gruene',
  'gruenerator',
];

const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function checkSiteHandle(
  raw: string
): { ok: true; handle: string } | { ok: false; reason: 'invalid' | 'reserved' } {
  const handle = raw.trim().toLowerCase();
  if (
    handle.length < SITE_HANDLE_MIN ||
    handle.length > SITE_HANDLE_MAX ||
    !HANDLE_PATTERN.test(handle)
  ) {
    return { ok: false, reason: 'invalid' };
  }
  if (RESERVED_SITE_HANDLES.includes(handle)) return { ok: false, reason: 'reserved' };
  return { ok: true, handle };
}

export const SITE_TITLE_MAX = 120;
export const SITE_TAGLINE_MAX = 200;
export const SITE_SECTION_TITLE_MAX = 120;
export const SITE_ACTION_TEXT_MAX = 80;
export const SITE_URL_MAX = 500;
export const SITE_THEMES_MAX = 6;
export const SITE_ACTIONS_MAX = 6;
export const SITE_SOCIAL_LINKS_MAX = 10;
export const SITE_PHONE_MAX = 40;

export const LEGAL_NAME_MAX = 120;
export const LEGAL_STREET_MAX = 160;
export const LEGAL_POSTAL_CODE_MAX = 12;
export const LEGAL_CITY_MAX = 80;
export const LEGAL_EMAIL_MAX = 254;
const SOCIAL_KEY_MAX = 30;
const INSTAGRAM_USERNAME_MAX = 60;

const urlField = z.string().max(SITE_URL_MAX);

export const siteLegalDraftSchema = z.object({
  name: z.string().max(LEGAL_NAME_MAX).optional(),
  street: z.string().max(LEGAL_STREET_MAX).optional(),
  postal_code: z.string().max(LEGAL_POSTAL_CODE_MAX).optional(),
  city: z.string().max(LEGAL_CITY_MAX).optional(),
  email: z.string().max(LEGAL_EMAIL_MAX).optional(),
  phone: z.string().max(SITE_PHONE_MAX).optional(),
});
export type SiteLegalDraft = z.infer<typeof siteLegalDraftSchema>;

const requiredLegalText = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max);

export const siteLegalSchema = z.object({
  name: requiredLegalText(LEGAL_NAME_MAX, 'Name fehlt'),
  street: requiredLegalText(LEGAL_STREET_MAX, 'Straße fehlt'),
  postal_code: requiredLegalText(LEGAL_POSTAL_CODE_MAX, 'Postleitzahl fehlt'),
  city: requiredLegalText(LEGAL_CITY_MAX, 'Ort fehlt'),
  email: z.string().trim().max(LEGAL_EMAIL_MAX).email('E-Mail-Adresse ist ungültig'),
  phone: z.string().max(SITE_PHONE_MAX).optional(),
});
export type SiteLegal = z.infer<typeof siteLegalSchema>;

const socialLinksDraft = z
  .record(z.string().max(SOCIAL_KEY_MAX), urlField)
  .refine((links) => Object.keys(links).length <= SITE_SOCIAL_LINKS_MAX, {
    message: 'Zu viele Social-Media-Links',
  });

const focusStep = z.union([
  z.literal(0),
  z.literal(25),
  z.literal(50),
  z.literal(75),
  z.literal(100),
]);
export const SITE_IMAGE_FOCUS_STEPS = [0, 25, 50, 75, 100] as const;

/** Where a cropped image stays in view, in percent steps; absent means the centre. */
export const siteImageFocusSchema = z.object({ x: focusStep, y: focusStep });
export type SiteImageFocus = z.infer<typeof siteImageFocusSchema>;

/** Names the role (how dark the leading ground is), not a colour: Tanne in DE, Dunkelgrün in AT. */
export const siteVariantSchema = z.enum(['dunkel', 'hell', 'leuchtend']);
export type SiteVariant = z.infer<typeof siteVariantSchema>;
export const DEFAULT_SITE_VARIANT: SiteVariant = 'dunkel';

export function readSiteVariant(theme: string | null): SiteVariant {
  const parsed = siteVariantSchema.safeParse(theme);
  return parsed.success ? parsed.data : DEFAULT_SITE_VARIANT;
}

/** Header ground: white as on gruene.de, or the colour of the variant. Absent means white. */
export const siteHeaderStyleSchema = z.enum(['weiss', 'farbig']);
export type SiteHeaderStyle = z.infer<typeof siteHeaderStyleSchema>;
export const DEFAULT_SITE_HEADER_STYLE: SiteHeaderStyle = 'weiss';

/** Hero layout: portrait beside the text, or the portrait as a full-bleed backdrop. Absent means portrait. */
export const siteHeroLayoutSchema = z.enum(['portrait', 'vollbild']);
export type SiteHeroLayout = z.infer<typeof siteHeroLayoutSchema>;
export const DEFAULT_SITE_HERO_LAYOUT: SiteHeroLayout = 'portrait';

// ── Page blocks ─────────────────────────────────────────────────────────────

/** A block or item id: stored with the page, so a copy or a concurrent move keeps its identity. */
export const siteIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

export const SITE_BLOCKS_MAX = 20;

export const siteBlockTypeSchema = z.enum([
  'hero',
  'about',
  'heroImage',
  'themes',
  'actions',
  'socialFeed',
  'contact',
]);
export type SiteBlockType = z.infer<typeof siteBlockTypeSchema>;

/**
 * What the page allows per block type. `max` counts blocks of the type on one page; the hero is
 * pinned to the top. Social feed and contact are page-wide (consent script, `#kontakt`, the
 * contact data), so they come once.
 */
export const SITE_BLOCK_TYPES = [
  { type: 'hero', max: 1, itemMax: null, pinned: true },
  { type: 'about', max: null, itemMax: null, pinned: false },
  { type: 'heroImage', max: null, itemMax: null, pinned: false },
  { type: 'themes', max: null, itemMax: SITE_THEMES_MAX, pinned: false },
  { type: 'actions', max: null, itemMax: SITE_ACTIONS_MAX, pinned: false },
  { type: 'socialFeed', max: 1, itemMax: null, pinned: false },
  { type: 'contact', max: 1, itemMax: null, pinned: false },
] as const satisfies readonly {
  type: SiteBlockType;
  max: number | null;
  itemMax: number | null;
  pinned: boolean;
}[];
export type SiteBlockSpec = (typeof SITE_BLOCK_TYPES)[number];

export function siteBlockSpec<T extends SiteBlockType>(
  type: T
): Extract<SiteBlockSpec, { type: T }> {
  return SITE_BLOCK_TYPES.find((spec) => spec.type === type) as Extract<SiteBlockSpec, { type: T }>;
}

/** The field schemas a block is built from: plain for the stored row, checked for the snapshot. */
export interface SiteBlockFields {
  image: z.ZodType<string>;
  focus: z.ZodOptional<typeof siteImageFocusSchema>;
  sectionTitle: z.ZodType<string>;
  bannerTitle: z.ZodType<string>;
  bannerSubtitle: z.ZodType<string>;
  actionText: z.ZodType<string>;
  link: z.ZodType<string>;
  instagram: z.ZodOptional<z.ZodType<string>>;
  richText: (max: number) => z.ZodType<RichTextDoc>;
  items: <T extends z.ZodType>(item: T, max: number) => z.ZodType<z.output<T>[]>;
  hidden: z.ZodOptional<z.ZodBoolean>;
  layout: z.ZodOptional<typeof siteHeroLayoutSchema>;
}

export function siteBlockObjects(f: SiteBlockFields) {
  const base = { id: siteIdSchema, hidden: f.hidden };
  return {
    hero: z.object({ ...base, type: z.literal('hero'), layout: f.layout }),
    about: z.object({
      ...base,
      type: z.literal('about'),
      title: f.sectionTitle,
      content: f.richText(SITE_ABOUT_MAX_LENGTH),
    }),
    heroImage: z.object({
      ...base,
      type: z.literal('heroImage'),
      imageUrl: f.image,
      imageFocus: f.focus,
      title: f.bannerTitle,
      subtitle: f.bannerSubtitle,
    }),
    themes: z.object({
      ...base,
      type: z.literal('themes'),
      items: f.items(
        z.object({
          id: siteIdSchema,
          title: f.sectionTitle,
          imageUrl: f.image,
          imageFocus: f.focus,
          content: f.richText(SITE_THEME_CONTENT_MAX_LENGTH),
        }),
        SITE_THEMES_MAX
      ),
    }),
    actions: z.object({
      ...base,
      type: z.literal('actions'),
      items: f.items(
        z.object({
          id: siteIdSchema,
          text: f.actionText,
          link: f.link,
          imageUrl: f.image,
          imageFocus: f.focus,
        }),
        SITE_ACTIONS_MAX
      ),
    }),
    socialFeed: z.object({
      ...base,
      type: z.literal('socialFeed'),
      title: f.sectionTitle,
      instagramUsername: f.instagram,
      showFeed: z.boolean(),
    }),
    contact: z.object({
      ...base,
      type: z.literal('contact'),
      title: f.sectionTitle,
      backgroundImageUrl: f.image,
      backgroundFocus: f.focus,
    }),
  };
}

const ROW_BLOCKS = siteBlockObjects({
  image: urlField,
  focus: siteImageFocusSchema.optional(),
  sectionTitle: z.string().max(SITE_SECTION_TITLE_MAX),
  bannerTitle: z.string().max(SITE_TITLE_MAX),
  bannerSubtitle: z.string().max(SITE_TAGLINE_MAX),
  actionText: z.string().max(SITE_ACTION_TEXT_MAX),
  link: urlField,
  instagram: z.string().max(INSTAGRAM_USERNAME_MAX).optional(),
  richText: (max) => boundedRichTextDoc(max),
  items: (item, max) => z.array(item).max(max),
  hidden: z.boolean().optional(),
  layout: siteHeroLayoutSchema.optional(),
});

export const siteBlockSchema = z.discriminatedUnion('type', [
  ROW_BLOCKS.hero,
  ROW_BLOCKS.about,
  ROW_BLOCKS.heroImage,
  ROW_BLOCKS.themes,
  ROW_BLOCKS.actions,
  ROW_BLOCKS.socialFeed,
  ROW_BLOCKS.contact,
]);
export type SiteBlock = z.infer<typeof siteBlockSchema>;
export type SiteBlockOf<T extends SiteBlockType> = Extract<SiteBlock, { type: T }>;
export type SiteThemeItem = SiteBlockOf<'themes'>['items'][number];
export type SiteActionItem = SiteBlockOf<'actions'>['items'][number];

export const HERO_ON_TOP_MESSAGE = 'Profil muss oben stehen';
const DUPLICATE_ID_MESSAGE = 'Kennung doppelt vergeben';

/** Rules across the blocks of one page: the hero on top, the per-type limits, unique ids. */
export function checkSitePage(
  blocks: readonly { id: string; type: SiteBlockType; items?: readonly { id: string }[] }[],
  ctx: z.RefinementCtx
): void {
  if (blocks[0]?.type !== 'hero' || blocks.filter((block) => block.type === 'hero').length !== 1) {
    ctx.addIssue({ code: 'custom', message: HERO_ON_TOP_MESSAGE });
  }
  for (const spec of SITE_BLOCK_TYPES) {
    if (spec.max === null) continue;
    if (blocks.filter((block) => block.type === spec.type).length > spec.max) {
      ctx.addIssue({ code: 'custom', message: `Zu viele Bausteine vom Typ ${spec.type}` });
    }
  }
  const seen = new Set<string>();
  for (const id of blocks.flatMap((block) => [block.id, ...(block.items ?? []).map((i) => i.id)])) {
    if (seen.has(id)) {
      ctx.addIssue({ code: 'custom', message: DUPLICATE_ID_MESSAGE });
      return;
    }
    seen.add(id);
  }
}

export const siteBlockListSchema = z
  .array(siteBlockSchema)
  .max(SITE_BLOCKS_MAX)
  .superRefine((blocks, ctx) => checkSitePage(blocks, ctx));

/** Canonical shape of the `sections` jsonb column: page settings plus the ordered blocks. */
export const siteSectionsSchema = z.object({
  header: siteHeaderStyleSchema.optional(),
  profileImageFocus: siteImageFocusSchema.optional(),
  blocks: siteBlockListSchema,
});
export type SiteSections = z.infer<typeof siteSectionsSchema>;

/** A new, empty block of `type`, with the default texts the page has always started with. */
export function defaultSiteBlock<T extends SiteBlockType>(
  type: T,
  newId: () => string
): SiteBlockOf<T> {
  const id = newId();
  const blocks: { [K in SiteBlockType]: () => SiteBlockOf<K> } = {
    hero: () => ({ id, type: 'hero' }),
    about: () => ({ id, type: 'about', title: 'Wer ich bin', content: emptyRichTextDoc() }),
    heroImage: () => ({
      id,
      type: 'heroImage',
      imageUrl: '',
      title: 'Gemeinsam für eine nachhaltige Zukunft!',
      subtitle: '',
    }),
    themes: () => ({ id, type: 'themes', items: [] }),
    actions: () => ({ id, type: 'actions', items: [] }),
    socialFeed: () => ({
      id,
      type: 'socialFeed',
      title: 'Instagram',
      instagramUsername: '',
      showFeed: false,
    }),
    contact: () => ({ id, type: 'contact', title: 'Kontakt', backgroundImageUrl: '' }),
  };
  return blocks[type]() as SiteBlockOf<T>;
}

/** The page a new site starts with: one block of each type, in the standard order. */
export function defaultSiteBlocks(newId: () => string): SiteBlock[] {
  return SITE_BLOCK_TYPES.map((spec) => defaultSiteBlock(spec.type, newId));
}

const LINK_MESSAGE = 'Link muss mit https:// beginnen';
const IMAGE_MESSAGE = 'Bild muss aus der Mediathek stammen';
const RICH_TEXT_FORMAT_MESSAGE = 'Text enthält nicht erlaubte Formatierung';
const RICH_TEXT_LENGTH_MESSAGE = 'Text ist zu lang';
const PHONE_MESSAGE = 'Telefonnummer enthält nicht erlaubte Zeichen';
const INSTAGRAM_MESSAGE = 'Instagram-Name enthält nicht erlaubte Zeichen';
const PLATFORM_MESSAGE = 'Unbekannte Plattform';

const SNAPSHOT_RICH_TEXT_MAX_DEPTH = 6;
const SNAPSHOT_RICH_TEXT_MAX_NODES = 500;

/** The platforms the site editor offers (HeroSectionEditor `ALL_PLATFORMS`). */
export const sitesSocialPlatformSchema = z.enum([
  'instagram',
  'facebook',
  'twitter',
  'linkedin',
  'mastodon',
  'youtube',
]);
export type SitesSocialPlatform = z.infer<typeof sitesSocialPlatformSchema>;

const snapshotMarkSchema = z.object({ type: z.enum(['bold', 'italic', 'underline']) }).strict();

type SnapshotNode = {
  type: string;
  attrs?: Record<string, unknown> | undefined;
  marks?: { type: string }[] | undefined;
  text?: string | undefined;
  content?: SnapshotNode[] | undefined;
};

/**
 * Closed per node type, mirroring `siteRichTextExtensions`
 * (richtext/index.ts): Document, Paragraph, Text, HardBreak, Bold, Italic,
 * Underline, Heading (levels 2 and 3), BulletList, OrderedList, ListItem.
 */
const snapshotNodeSchema: z.ZodType<SnapshotNode> = z.lazy(() => {
  const children = z.array(snapshotNodeSchema).optional();
  const marks = z.array(snapshotMarkSchema).optional();
  return z.union([
    z.object({ type: z.literal('text'), text: z.string(), marks }).strict(),
    z.object({ type: z.literal('hardBreak'), marks }).strict(),
    z.object({ type: z.literal('paragraph'), content: children }).strict(),
    z
      .object({
        type: z.literal('heading'),
        attrs: z.object({ level: z.union([z.literal(2), z.literal(3)]) }).strict(),
        content: children,
      })
      .strict(),
    z.object({ type: z.literal('bulletList'), content: children }).strict(),
    z
      .object({
        type: z.literal('orderedList'),
        attrs: z
          .object({ start: z.number().int().positive().optional(), type: z.null().optional() })
          .strict()
          .optional(),
        content: children,
      })
      .strict(),
    z.object({ type: z.literal('listItem'), content: children }).strict(),
  ]);
});

const snapshotDocSchema = z
  .object({ type: z.literal('doc'), content: z.array(snapshotNodeSchema).optional() })
  .strict();

/** Iterative, so a hostile nesting cannot overflow the stack before the bound applies. */
function measureRichText(doc: unknown): { depth: number; nodes: number } {
  let depth = 0;
  let nodes = 0;
  const stack: { value: unknown; depth: number }[] = [{ value: doc, depth: 0 }];
  while (stack.length > 0) {
    const item = stack.pop();
    if (!item || typeof item.value !== 'object' || item.value === null) continue;
    nodes += 1;
    depth = Math.max(depth, item.depth);
    if (nodes > SNAPSHOT_RICH_TEXT_MAX_NODES || depth > SNAPSHOT_RICH_TEXT_MAX_DEPTH) break;
    const content = (item.value as { content?: unknown }).content;
    if (Array.isArray(content)) {
      for (const child of content) stack.push({ value: child, depth: item.depth + 1 });
    }
  }
  return { depth, nodes };
}

/** Rich text as the public renderer may receive it: closed node and mark set, no free attrs. */
export const snapshotRichTextDoc = (maxLength: number) =>
  z.custom<RichTextDoc>().superRefine((value, ctx) => {
    const { depth, nodes } = measureRichText(value);
    if (depth > SNAPSHOT_RICH_TEXT_MAX_DEPTH || nodes > SNAPSHOT_RICH_TEXT_MAX_NODES) {
      ctx.addIssue({ code: 'custom', message: RICH_TEXT_FORMAT_MESSAGE });
      return;
    }
    const parsed = snapshotDocSchema.safeParse(value);
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', message: RICH_TEXT_FORMAT_MESSAGE });
      return;
    }
    if (getRichTextLength(value) > maxLength) {
      ctx.addIssue({ code: 'custom', message: RICH_TEXT_LENGTH_MESSAGE });
    }
  });

const isHttpUrl = (value: string): boolean => {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
};

const isMailtoLink = (value: string): boolean => {
  if (!/^mailto:/i.test(value)) return false;
  const address = value.slice('mailto:'.length);
  return !/[?\s]/.test(address) && z.string().email().safeParse(address).success;
};

const isActionLink = (value: string): boolean =>
  isHttpUrl(value) || isMailtoLink(value) || /^#[a-z][a-z0-9-]*$/.test(value);

const isSiteImage = (value: string): boolean =>
  value === '' ||
  /^\/api\/share\/[A-Za-z0-9_-]{6,128}\/preview$/.test(value) ||
  /^\/api\/image-picker\/stock-image\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(value);

const snapshotImage = urlField.refine(isSiteImage, { message: IMAGE_MESSAGE });
const snapshotLink = urlField.refine(isActionLink, { message: LINK_MESSAGE });
const snapshotSocialUrl = urlField.refine(isHttpUrl, { message: LINK_MESSAGE });
const snapshotPhone = z
  .string()
  .max(SITE_PHONE_MAX)
  .regex(/^[0-9 +()/.-]{0,40}$/, PHONE_MESSAGE);

const EMPTY_LEGAL = { name: '', street: '', postal_code: '', city: '', email: '' };

/** One hero, first: an existing one moves up, a missing one is added. */
export function withHeroOnTop<B extends { id: string; type: SiteBlockType }>(blocks: B[]): B[] {
  const hero = blocks.find((block) => block.type === 'hero');
  const rest = blocks.filter((block) => block.type !== 'hero');
  const top = hero ?? (defaultSiteBlock('hero', () => uniqueHeroId(blocks)) as unknown as B);
  return [top, ...rest];
}

function uniqueHeroId(blocks: readonly { id: string }[]): string {
  const taken = new Set(blocks.map((block) => block.id));
  let id = 'hero';
  for (let n = 2; taken.has(id); n += 1) id = `hero-${n}`;
  return id;
}

function snapshotSchemaFor(mode: 'publish' | 'preview') {
  // `.catch` keeps the output type, so both modes infer the same shape.
  const lenient = <T extends z.ZodType>(schema: T, fallback: z.output<T>): T =>
    mode === 'preview' ? (schema.catch(fallback) as unknown as T) : schema;

  const image = lenient(snapshotImage, '');
  const sectionTitle = lenient(z.string().max(SITE_SECTION_TITLE_MAX), '');
  const richText = (max: number) => lenient(snapshotRichTextDoc(max), emptyRichTextDoc());

  const focus = lenient(siteImageFocusSchema.optional(), undefined);

  const blockObjects = siteBlockObjects({
    image,
    focus,
    sectionTitle,
    bannerTitle: lenient(z.string().max(SITE_TITLE_MAX), ''),
    bannerSubtitle: lenient(z.string().max(SITE_TAGLINE_MAX), ''),
    actionText: lenient(z.string().max(SITE_ACTION_TEXT_MAX), ''),
    link: lenient(snapshotLink, ''),
    instagram: lenient(
      z
        .union([z.literal(''), z.string().regex(/^[A-Za-z0-9._]{1,30}$/, INSTAGRAM_MESSAGE)])
        .optional(),
      ''
    ),
    richText,
    items: (item, max) => lenient(z.array(item).max(max), []),
    hidden: lenient(z.boolean().optional(), undefined),
    layout: lenient(siteHeroLayoutSchema.optional(), undefined),
  });
  const block = z.discriminatedUnion('type', [
    blockObjects.hero,
    blockObjects.about,
    blockObjects.heroImage,
    blockObjects.themes,
    blockObjects.actions,
    blockObjects.socialFeed,
    blockObjects.contact,
  ]);
  // Publishing checks the page as a whole; the preview drops a block that does not parse and
  // puts a hero on top, so one broken block never blanks the editor.
  const blocks =
    mode === 'preview'
      ? z
          .array(z.unknown())
          .max(SITE_BLOCKS_MAX)
          .catch([])
          .transform((raw) =>
            withHeroOnTop(
              raw.flatMap((entry) => {
                const parsed = block.safeParse(entry);
                return parsed.success ? [parsed.data] : [];
              })
            )
          )
      : z
          .array(block)
          .max(SITE_BLOCKS_MAX)
          .superRefine((list, ctx) => checkSitePage(list, ctx));

  const sections = z.object({
    header: lenient(siteHeaderStyleSchema.optional(), undefined),
    profileImageFocus: focus,
    blocks,
  });

  const socialLinks =
    mode === 'preview'
      ? z
          .record(z.string(), z.string())
          .catch({})
          .transform((links) =>
            Object.fromEntries(
              Object.entries(links).filter(
                ([key, value]) =>
                  sitesSocialPlatformSchema.safeParse(key).success && isHttpUrl(value)
              )
            )
          )
      : z.record(z.string().max(SOCIAL_KEY_MAX), snapshotSocialUrl).superRefine((links, ctx) => {
          const keys = Object.keys(links);
          if (keys.length > SITE_SOCIAL_LINKS_MAX) {
            ctx.addIssue({ code: 'custom', message: 'Zu viele Social-Media-Links' });
          }
          for (const key of keys) {
            if (!sitesSocialPlatformSchema.safeParse(key).success) {
              ctx.addIssue({ code: 'custom', message: PLATFORM_MESSAGE, path: [key] });
            }
          }
        });

  const legal = siteLegalSchema.extend({ phone: snapshotPhone.optional() });
  const legalField = <T extends z.ZodType>(schema: T) => lenient(schema, '' as z.output<T>);
  const legalLenient = z.object({
    name: legalField(legal.shape.name),
    street: legalField(legal.shape.street),
    postal_code: legalField(legal.shape.postal_code),
    city: legalField(legal.shape.city),
    email: legalField(legal.shape.email),
    phone: lenient(snapshotPhone, '').optional(),
  });

  return z.object({
    version: z.literal(2),
    locale: localeSchema,
    site_title: lenient(z.string().trim().min(1, 'Titel fehlt').max(SITE_TITLE_MAX), ''),
    tagline: lenient(z.string().max(SITE_TAGLINE_MAX), ''),
    profile_image: image,
    contact_email: lenient(z.union([z.literal(''), z.string().max(LEGAL_EMAIL_MAX).email()]), ''),
    contact_phone: lenient(snapshotPhone, ''),
    social_links: socialLinks,
    sections,
    legal: mode === 'preview' ? legalLenient.catch(EMPTY_LEGAL) : legal,
    variant: lenient(siteVariantSchema.default(DEFAULT_SITE_VARIANT), DEFAULT_SITE_VARIANT),
  });
}

export const publishedSiteSnapshotSchema = snapshotSchemaFor('publish');
export const previewSiteSnapshotSchema = snapshotSchemaFor('preview');

/** Mirrors the user_sites row (apps/api/database/schema/sites.ts) as serialized to JSON. */
export const siteSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  subdomain: z.string(),
  is_published: z.boolean().nullable(),
  site_title: z.string(),
  tagline: z.string().nullable(),
  contact_email: z.string().nullable(),
  contact_phone: z.string().nullable(),
  contact_website: z.string().nullable(),
  social_links: z.record(z.string(), z.string()).nullable(),
  theme: z.string().nullable(),
  accent_color: z.string().nullable(),
  profile_image: z.string().nullable(),
  background_image: z.string().nullable(),
  sections: siteSectionsSchema.nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  last_published: z.string().nullable(),
  visit_count: z.number().nullable(),
  meta_description: z.string().nullable(),
  meta_keywords: z.array(z.string()).nullable(),
  legal: siteLegalDraftSchema.nullable(),
  moderation: moderationStateSchema,
  has_unpublished_changes: z.boolean(),
  published_snapshot: previewSiteSnapshotSchema.nullable(),
});
export type Site = z.infer<typeof siteSchema>;
export type PublishedSiteSnapshot = z.infer<typeof publishedSiteSnapshotSchema>;

export const sitePublishIssueSchema = z.object({ path: z.string(), message: z.string() });
export type SitePublishIssue = z.infer<typeof sitePublishIssueSchema>;
export const sitePublishErrorSchema = z.object({
  error: z.string(),
  issues: z.array(sitePublishIssueSchema),
});

export type SiteSnapshotSource = Pick<
  Site,
  | 'site_title'
  | 'tagline'
  | 'profile_image'
  | 'theme'
  | 'contact_email'
  | 'contact_phone'
  | 'social_links'
  | 'sections'
  | 'legal'
>;

// A stored or half-typed value can be anything; the schema blanks a non-string afterwards.
const toPreviewUrl = (url: unknown): string =>
  (typeof url === 'string' ? url : '').replace(
    /^(\/api\/share\/[A-Za-z0-9_-]+)\/download$/,
    '$1/preview'
  );

const GREETING_PREFIX =
  /^\s{0,8}(?:(?:hallo|hi|hey|servus|moin|moin moin|grüß gott|grüß dich|grüezi|guten tag|liebe besucher\*?innen)[\s,!.:–-]{0,8})?(?:ich bin|ich heiße|mein name ist|ich heisse)\s{1,8}/i;

const TRAILING_PUNCTUATION = new Set([...' \t\n\r!.,:;–-']);

function trimEndChars(value: string, chars: ReadonlySet<string>): string {
  let end = value.length;
  while (end > 0 && chars.has(value[end - 1] ?? '')) end -= 1;
  return value.slice(0, end);
}

/** The name field holds only the name: a greeting the model put there is cut off. */
export function stripGreeting(heading: string): string {
  const stripped = trimEndChars(
    heading
      .replace(GREETING_PREFIX, '')
      .replace(/^(?:hallo|hi|hey|servus|moin|grüß gott)[\s,!.:–-]{1,8}/i, ''),
    TRAILING_PUNCTUATION
  ).trim();
  return stripped === '' ? heading : stripped;
}

// TODO(#5789): unverified — confirm the Austrian membership URL
export const SITE_MEMBER_LINKS: Record<SupportedLocale, string> = {
  'de-DE': 'https://www.gruene.de/mitglied-werden',
  'de-AT': 'https://www.gruene.at/mitmachen',
};

const SLASH = new Set(['/']);

const sameMemberUrl = (url: string): string =>
  trimEndChars(url.trim().replace(/^(https?:\/\/)www\./i, '$1'), SLASH).toLowerCase();
const KNOWN_MEMBER_URLS = new Set(Object.values(SITE_MEMBER_LINKS).map(sameMemberUrl));

/** Swaps only the party's own member URLs to the locale's one; every other link stays as typed. */
function localizeActionLink(link: string, locale: SupportedLocale): string {
  return KNOWN_MEMBER_URLS.has(sameMemberUrl(link)) ? SITE_MEMBER_LINKS[locale] : link;
}

function normaliseBlock(block: SiteBlock, locale: SupportedLocale): SiteBlock {
  switch (block.type) {
    case 'heroImage':
      return { ...block, imageUrl: toPreviewUrl(block.imageUrl) };
    case 'themes':
      return {
        ...block,
        items: block.items.map((item) => ({ ...item, imageUrl: toPreviewUrl(item.imageUrl) })),
      };
    case 'actions':
      return {
        ...block,
        items: block.items.map((item) => ({
          ...item,
          link: localizeActionLink(item.link, locale),
          imageUrl: toPreviewUrl(item.imageUrl),
        })),
      };
    case 'contact':
      return { ...block, backgroundImageUrl: toPreviewUrl(block.backgroundImageUrl) };
    default:
      return block;
  }
}

export interface SiteSnapshotOptions {
  /** Keep hidden blocks (marked `hidden: true`), for the editor canvas. */
  includeHidden?: boolean;
}

function snapshotCandidate(
  source: SiteSnapshotSource,
  locale: SupportedLocale,
  options: SiteSnapshotOptions = {}
) {
  const legal = source.legal ?? {};
  const socialLinks = Object.fromEntries(
    Object.entries(source.social_links ?? {}).filter(([, value]) => value.trim() !== '')
  );
  const sections = source.sections;
  const blocks = (sections?.blocks ?? [])
    .filter((block) => options.includeHidden || !block.hidden)
    .map((block) => normaliseBlock(block, locale));
  return {
    version: 2,
    locale,
    site_title: source.site_title,
    tagline: source.tagline ?? '',
    profile_image: toPreviewUrl(source.profile_image),
    contact_email: source.contact_email ?? '',
    contact_phone: source.contact_phone ?? '',
    social_links: socialLinks,
    sections: {
      ...(sections?.header ? { header: sections.header } : {}),
      ...(sections?.profileImageFocus ? { profileImageFocus: sections.profileImageFocus } : {}),
      blocks,
    },
    legal: {
      name: legal.name ?? '',
      street: legal.street ?? '',
      postal_code: legal.postal_code ?? '',
      city: legal.city ?? '',
      email: legal.email ?? '',
      ...(legal.phone ? { phone: legal.phone } : {}),
    },
    variant: readSiteVariant(source.theme),
  };
}

/** `sections.blocks.3.items.1.link` → `blocks.<blockId>.items.<itemId>.link`, the editor's address. */
function issuePath(path: readonly PropertyKey[], blocks: readonly SiteBlock[]): string {
  if (path[0] !== 'sections' || path[1] !== 'blocks' || typeof path[2] !== 'number') {
    return path.map(String).join('.');
  }
  const block = blocks[path[2]];
  if (!block) return 'blocks';
  const rest = path.slice(3).map(String);
  if (rest[0] === 'items' && 'items' in block && rest[1] !== undefined) {
    const item = block.items[Number(rest[1])];
    if (item) rest[1] = item.id;
  }
  return ['blocks', block.id, ...rest].join('.');
}

export function buildSiteSnapshot(
  source: SiteSnapshotSource,
  locale: SupportedLocale
): { ok: true; snapshot: PublishedSiteSnapshot } | { ok: false; issues: SitePublishIssue[] } {
  if (!source.legal) {
    return { ok: false, issues: [{ path: 'legal', message: 'Impressumsangaben fehlen' }] };
  }
  const candidate = snapshotCandidate(source, locale);
  const parsed = publishedSiteSnapshotSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, snapshot: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issuePath(issue.path, candidate.sections.blocks),
      message: issue.message,
    })),
  };
}

/** Never fails: whatever does not validate is replaced by its empty value, for the editor preview. */
export function buildSitePreviewSnapshot(
  source: SiteSnapshotSource,
  locale: SupportedLocale,
  options: SiteSnapshotOptions = {}
): PublishedSiteSnapshot {
  return previewSiteSnapshotSchema.parse(snapshotCandidate(source, locale, options));
}

export const siteResponseSchema = z.object({ site: siteSchema });
export const mySiteResponseSchema = z.object({
  site: siteSchema.nullable(),
  public_origin: z.string().nullable(),
});

export const createSiteBodySchema = z.object({
  subdomain: z.string().min(1).max(SITE_HANDLE_MAX),
  site_title: z.string().min(1).max(SITE_TITLE_MAX),
  tagline: z.string().max(SITE_TAGLINE_MAX).optional(),
  theme: z.string().max(40).optional(),
  contact_email: z.string().max(LEGAL_EMAIL_MAX).optional(),
  contact_phone: z.string().max(SITE_PHONE_MAX).optional(),
  social_links: socialLinksDraft.optional(),
  profile_image: urlField.optional(),
  background_image: urlField.optional(),
  sections: siteSectionsSchema.optional(),
  legal: siteLegalDraftSchema.optional(),
});
export type CreateSiteBody = z.infer<typeof createSiteBodySchema>;

export const updateUserSiteBodySchema = z.object({
  subdomain: z.string().min(1).max(SITE_HANDLE_MAX).optional(),
  site_title: z.string().max(SITE_TITLE_MAX).optional(),
  theme: siteVariantSchema.optional(),
  tagline: z.string().max(SITE_TAGLINE_MAX).optional(),
  contact_email: z.string().max(LEGAL_EMAIL_MAX).optional(),
  contact_phone: z.string().max(SITE_PHONE_MAX).optional(),
  social_links: socialLinksDraft.optional(),
  accent_color: z.string().max(40).optional(),
  profile_image: urlField.optional(),
  background_image: urlField.optional(),
  sections: siteSectionsSchema.optional(),
  legal: siteLegalDraftSchema.optional(),
  meta_description: z.string().max(300).optional(),
  meta_keywords: z.array(z.string().max(60)).max(30).optional(),
});
export type UpdateSiteBody = z.infer<typeof updateUserSiteBodySchema>;

export const publishSiteBodySchema = z.object({ publish: z.boolean() });

export const checkSubdomainResponseSchema = z.object({
  available: z.boolean(),
  reason: z.enum(['invalid', 'reserved']).optional(),
});
export type CheckSubdomainResponse = z.infer<typeof checkSubdomainResponseSchema>;

export const deleteSiteResponseSchema = z.object({ success: z.boolean() });

export const sitesErrorSchema = z.object({ error: z.string() });
