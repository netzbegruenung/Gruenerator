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

const LEGAL_NAME_MAX = 120;
const LEGAL_STREET_MAX = 160;
const LEGAL_POSTAL_CODE_MAX = 12;
const LEGAL_CITY_MAX = 80;
const LEGAL_EMAIL_MAX = 254;
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

export const siteThemeCardSchema = z.object({
  imageUrl: urlField,
  title: z.string().max(SITE_SECTION_TITLE_MAX),
  content: boundedRichTextDoc(SITE_THEME_CONTENT_MAX_LENGTH),
});
export type SiteThemeCard = z.infer<typeof siteThemeCardSchema>;

export const siteActionTileSchema = z.object({
  imageUrl: urlField,
  text: z.string().max(SITE_ACTION_TEXT_MAX),
  link: urlField,
});
export type SiteActionTile = z.infer<typeof siteActionTileSchema>;

export const siteSectionsSchema = z.object({
  heroImage: z
    .object({
      imageUrl: urlField,
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
    .object({ title: z.string().max(SITE_SECTION_TITLE_MAX), backgroundImageUrl: urlField })
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
});
export type Site = z.infer<typeof siteSchema>;

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
  attrs?: Record<string, unknown>;
  marks?: { type: string }[];
  text?: string;
  content?: SnapshotNode[];
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
  return !/[?\s\u0000-\u001f\u007f]/.test(address) && z.string().email().safeParse(address).success;
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
  .regex(/^[0-9 +()\/.-]{0,40}$/, PHONE_MESSAGE);

const snapshotSectionsSchema = z.object({
  heroImage: z
    .object({
      imageUrl: snapshotImage,
      title: z.string().max(SITE_TITLE_MAX),
      subtitle: z.string().max(SITE_TAGLINE_MAX),
    })
    .optional(),
  about: z
    .object({
      title: z.string().max(SITE_SECTION_TITLE_MAX),
      content: snapshotRichTextDoc(SITE_ABOUT_MAX_LENGTH),
    })
    .optional(),
  themes: z
    .array(
      siteThemeCardSchema.extend({
        imageUrl: snapshotImage,
        content: snapshotRichTextDoc(SITE_THEME_CONTENT_MAX_LENGTH),
      })
    )
    .max(SITE_THEMES_MAX)
    .optional(),
  actions: z
    .array(siteActionTileSchema.extend({ imageUrl: snapshotImage, link: snapshotLink }))
    .max(SITE_ACTIONS_MAX)
    .optional(),
  contact: z
    .object({ title: z.string().max(SITE_SECTION_TITLE_MAX), backgroundImageUrl: snapshotImage })
    .optional(),
  socialFeed: z
    .object({
      title: z.string().max(SITE_SECTION_TITLE_MAX),
      instagramUsername: z
        .union([z.literal(''), z.string().regex(/^[A-Za-z0-9._]{1,30}$/, INSTAGRAM_MESSAGE)])
        .optional(),
      showFeed: z.boolean(),
    })
    .optional(),
});

export const publishedSiteSnapshotSchema = z.object({
  version: z.literal(1),
  locale: localeSchema,
  site_title: z.string().trim().min(1, 'Titel fehlt').max(SITE_TITLE_MAX),
  tagline: z.string().max(SITE_TAGLINE_MAX),
  profile_image: snapshotImage,
  contact_email: z.union([z.literal(''), z.string().max(LEGAL_EMAIL_MAX).email()]),
  contact_phone: snapshotPhone,
  social_links: z
    .record(z.string().max(SOCIAL_KEY_MAX), snapshotSocialUrl)
    .superRefine((links, ctx) => {
      const keys = Object.keys(links);
      if (keys.length > SITE_SOCIAL_LINKS_MAX) {
        ctx.addIssue({ code: 'custom', message: 'Zu viele Social-Media-Links' });
      }
      for (const key of keys) {
        if (!sitesSocialPlatformSchema.safeParse(key).success) {
          ctx.addIssue({ code: 'custom', message: PLATFORM_MESSAGE, path: [key] });
        }
      }
    }),
  sections: snapshotSectionsSchema,
  legal: siteLegalSchema.extend({ phone: snapshotPhone.optional() }),
});
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
  | 'contact_email'
  | 'contact_phone'
  | 'social_links'
  | 'sections'
  | 'legal'
>;

const toPreviewUrl = (url: string | null | undefined): string =>
  (url ?? '').replace(/^(\/api\/share\/[A-Za-z0-9_-]+)\/download$/, '$1/preview');

function normaliseSections(sections: SiteSections | null): SiteSections {
  if (!sections) return {};
  const out: SiteSections = { ...sections };
  if (sections.heroImage) {
    out.heroImage = { ...sections.heroImage, imageUrl: toPreviewUrl(sections.heroImage.imageUrl) };
  }
  if (sections.themes) {
    out.themes = sections.themes.map((t) => ({ ...t, imageUrl: toPreviewUrl(t.imageUrl) }));
  }
  if (sections.actions) {
    out.actions = sections.actions.map((a) => ({ ...a, imageUrl: toPreviewUrl(a.imageUrl) }));
  }
  if (sections.contact) {
    out.contact = {
      ...sections.contact,
      backgroundImageUrl: toPreviewUrl(sections.contact.backgroundImageUrl),
    };
  }
  return out;
}

export function buildSiteSnapshot(
  source: SiteSnapshotSource,
  locale: SupportedLocale
): { ok: true; snapshot: PublishedSiteSnapshot } | { ok: false; issues: SitePublishIssue[] } {
  if (!source.legal) {
    return { ok: false, issues: [{ path: 'legal', message: 'Impressumsangaben fehlen' }] };
  }
  const legal = source.legal;
  const socialLinks = Object.fromEntries(
    Object.entries(source.social_links ?? {}).filter(([, value]) => value.trim() !== '')
  );
  const parsed = publishedSiteSnapshotSchema.safeParse({
    version: 1,
    locale,
    site_title: source.site_title,
    tagline: source.tagline ?? '',
    profile_image: toPreviewUrl(source.profile_image),
    contact_email: source.contact_email ?? '',
    contact_phone: source.contact_phone ?? '',
    social_links: socialLinks,
    sections: normaliseSections(source.sections),
    legal: {
      name: legal.name ?? '',
      street: legal.street ?? '',
      postal_code: legal.postal_code ?? '',
      city: legal.city ?? '',
      email: legal.email ?? '',
      ...(legal.phone ? { phone: legal.phone } : {}),
    },
  });
  if (parsed.success) return { ok: true, snapshot: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

export const siteResponseSchema = z.object({ site: siteSchema });
export const mySiteResponseSchema = z.object({ site: siteSchema.nullable() });

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
  site_title: z.string().max(SITE_TITLE_MAX).optional(),
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

export const deleteSiteResponseSchema = z.object({ success: z.boolean() });

export const sitesErrorSchema = z.object({ error: z.string() });
