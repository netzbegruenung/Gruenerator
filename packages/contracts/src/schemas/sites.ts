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
/** Live Websites one account may have at a time; trashed ones do not count. */
export const SITES_PER_ACCOUNT_MAX = 25;
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
  // Editor paths under /sites/ that a handle must not shadow (/sites/<handle> is the editor).
  'neu',
  'demo',
  'edit',
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

export const siteThemeCardSchema = z.object({
  imageUrl: urlField,
  imageFocus: siteImageFocusSchema.optional(),
  title: z.string().max(SITE_SECTION_TITLE_MAX),
  content: boundedRichTextDoc(SITE_THEME_CONTENT_MAX_LENGTH),
});
export type SiteThemeCard = z.infer<typeof siteThemeCardSchema>;

export const siteActionTileSchema = z.object({
  imageUrl: urlField,
  imageFocus: siteImageFocusSchema.optional(),
  text: z.string().max(SITE_ACTION_TEXT_MAX),
  link: urlField,
});
export type SiteActionTile = z.infer<typeof siteActionTileSchema>;

/** Names the role (how dark the leading ground is), not a colour: Tanne in DE, Dunkelgrün in AT. */
export const siteVariantSchema = z.enum(['dunkel', 'hell', 'leuchtend']);
export type SiteVariant = z.infer<typeof siteVariantSchema>;
export const DEFAULT_SITE_VARIANT: SiteVariant = 'dunkel';

export function readSiteVariant(theme: string | null): SiteVariant {
  const parsed = siteVariantSchema.safeParse(theme);
  return parsed.success ? parsed.data : DEFAULT_SITE_VARIANT;
}

export const siteOptionalSectionSchema = z.enum([
  'about',
  'heroImage',
  'themes',
  'actions',
  'socialFeed',
  'contact',
]);
export type SiteOptionalSection = z.infer<typeof siteOptionalSectionSchema>;

/** Page order; the same values as `SectionType` in packages/sites editorStore. */
export const SITE_SECTION_IDS = [
  'hero',
  'about',
  'heroImage',
  'themes',
  'actions',
  'socialFeed',
  'contact',
] as const;
export type SiteSectionId = (typeof SITE_SECTION_IDS)[number];

export const siteSectionsSchema = z.object({
  hidden: z.array(siteOptionalSectionSchema).max(6).optional(),
  profileImageFocus: siteImageFocusSchema.optional(),
  heroImage: z
    .object({
      imageUrl: urlField,
      imageFocus: siteImageFocusSchema.optional(),
      title: z.string().max(SITE_TITLE_MAX),
      subtitle: z.string().max(SITE_TAGLINE_MAX),
    })
    .optional(),
  about: z
    .object({
      title: z.string().max(SITE_SECTION_TITLE_MAX),
      content: boundedRichTextDoc(SITE_ABOUT_MAX_LENGTH),
    })
    .optional(),
  themes: z.array(siteThemeCardSchema).max(SITE_THEMES_MAX).optional(),
  actions: z.array(siteActionTileSchema).max(SITE_ACTIONS_MAX).optional(),
  contact: z
    .object({
      title: z.string().max(SITE_SECTION_TITLE_MAX),
      backgroundImageUrl: urlField,
      backgroundFocus: siteImageFocusSchema.optional(),
    })
    .optional(),
  socialFeed: z
    .object({
      title: z.string().max(SITE_SECTION_TITLE_MAX),
      instagramUsername: z.string().max(INSTAGRAM_USERNAME_MAX).optional(),
      showFeed: z.boolean(),
    })
    .optional(),
});
export type SiteSections = z.infer<typeof siteSectionsSchema>;

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

function snapshotSchemaFor(mode: 'publish' | 'preview') {
  // `.catch` keeps the output type, so both modes infer the same shape.
  const lenient = <T extends z.ZodType>(schema: T, fallback: z.output<T>): T =>
    mode === 'preview' ? (schema.catch(fallback) as unknown as T) : schema;

  const image = lenient(snapshotImage, '');
  const sectionTitle = lenient(z.string().max(SITE_SECTION_TITLE_MAX), '');
  const richText = (max: number) => lenient(snapshotRichTextDoc(max), emptyRichTextDoc());

  const focus = lenient(siteImageFocusSchema.optional(), undefined);

  const sections = z.object({
    profileImageFocus: focus,
    heroImage: z
      .object({
        imageUrl: image,
        imageFocus: focus,
        title: lenient(z.string().max(SITE_TITLE_MAX), ''),
        subtitle: lenient(z.string().max(SITE_TAGLINE_MAX), ''),
      })
      .optional(),
    about: z.object({ title: sectionTitle, content: richText(SITE_ABOUT_MAX_LENGTH) }).optional(),
    themes: lenient(
      z
        .array(
          z.object({
            imageUrl: image,
            imageFocus: focus,
            title: sectionTitle,
            content: richText(SITE_THEME_CONTENT_MAX_LENGTH),
          })
        )
        .max(SITE_THEMES_MAX)
        .optional(),
      []
    ),
    actions: lenient(
      z
        .array(
          z.object({
            imageUrl: image,
            imageFocus: focus,
            text: lenient(z.string().max(SITE_ACTION_TEXT_MAX), ''),
            link: lenient(snapshotLink, ''),
          })
        )
        .max(SITE_ACTIONS_MAX)
        .optional(),
      []
    ),
    contact: z
      .object({ title: sectionTitle, backgroundImageUrl: image, backgroundFocus: focus })
      .optional(),
    socialFeed: z
      .object({
        title: sectionTitle,
        instagramUsername: lenient(
          z
            .union([z.literal(''), z.string().regex(/^[A-Za-z0-9._]{1,30}$/, INSTAGRAM_MESSAGE)])
            .optional(),
          ''
        ),
        showFeed: z.boolean(),
      })
      .optional(),
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
    version: z.literal(1),
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
    hidden_sections: lenient(z.array(siteOptionalSectionSchema).max(6).default([]), []),
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

const toPreviewUrl = (url: string | null | undefined): string =>
  (url ?? '').replace(/^(\/api\/share\/[A-Za-z0-9_-]+)\/download$/, '$1/preview');

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

function normaliseSections(sections: SiteSections | null, locale: SupportedLocale): SiteSections {
  if (!sections) return {};
  const { hidden: _hidden, ...rest } = sections;
  const out: SiteSections = { ...rest };
  if (sections.heroImage) {
    out.heroImage = { ...sections.heroImage, imageUrl: toPreviewUrl(sections.heroImage.imageUrl) };
  }
  if (sections.themes) {
    out.themes = sections.themes.map((t) => ({ ...t, imageUrl: toPreviewUrl(t.imageUrl) }));
  }
  if (sections.actions) {
    out.actions = sections.actions.map((a) => ({
      ...a,
      link: localizeActionLink(a.link, locale),
      imageUrl: toPreviewUrl(a.imageUrl),
    }));
  }
  if (sections.contact) {
    out.contact = {
      ...sections.contact,
      backgroundImageUrl: toPreviewUrl(sections.contact.backgroundImageUrl),
    };
  }
  return out;
}

function snapshotCandidate(source: SiteSnapshotSource, locale: SupportedLocale) {
  const legal = source.legal ?? {};
  const socialLinks = Object.fromEntries(
    Object.entries(source.social_links ?? {}).filter(([, value]) => value.trim() !== '')
  );
  const hidden = new Set<string>(source.sections?.hidden ?? []);
  return {
    version: 1,
    locale,
    site_title: source.site_title,
    tagline: source.tagline ?? '',
    profile_image: toPreviewUrl(source.profile_image),
    contact_email: source.contact_email ?? '',
    contact_phone: source.contact_phone ?? '',
    social_links: socialLinks,
    sections: normaliseSections(source.sections, locale),
    legal: {
      name: legal.name ?? '',
      street: legal.street ?? '',
      postal_code: legal.postal_code ?? '',
      city: legal.city ?? '',
      email: legal.email ?? '',
      ...(legal.phone ? { phone: legal.phone } : {}),
    },
    variant: readSiteVariant(source.theme),
    hidden_sections: SITE_SECTION_IDS.filter(
      (id): id is SiteOptionalSection => id !== 'hero' && hidden.has(id)
    ),
  };
}

export function buildSiteSnapshot(
  source: SiteSnapshotSource,
  locale: SupportedLocale
): { ok: true; snapshot: PublishedSiteSnapshot } | { ok: false; issues: SitePublishIssue[] } {
  if (!source.legal) {
    return { ok: false, issues: [{ path: 'legal', message: 'Impressumsangaben fehlen' }] };
  }
  const parsed = publishedSiteSnapshotSchema.safeParse(snapshotCandidate(source, locale));
  if (parsed.success) return { ok: true, snapshot: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

/** Never fails: whatever does not validate is replaced by its empty value, for the editor preview. */
export function buildSitePreviewSnapshot(
  source: SiteSnapshotSource,
  locale: SupportedLocale
): PublishedSiteSnapshot {
  return previewSiteSnapshotSchema.parse(snapshotCandidate(source, locale));
}

export const siteResponseSchema = z.object({ site: siteSchema });
export const mySiteResponseSchema = z.object({
  site: siteSchema.nullable(),
  public_origin: z.string().nullable(),
});
export const siteSummarySchema = siteSchema.pick({
  id: true,
  subdomain: true,
  site_title: true,
  is_published: true,
  last_published: true,
  moderation: true,
  updated_at: true,
  profile_image: true,
  theme: true,
});
export type SiteSummary = z.infer<typeof siteSummarySchema>;
export const siteListResponseSchema = z.object({
  sites: z.array(siteSummarySchema),
  public_origin: z.string().nullable(),
  limit: z.number().int(),
});
export const siteByHandleResponseSchema = z.object({
  site: siteSchema,
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
