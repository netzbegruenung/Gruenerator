import {
  SITE_DRAFT_SECTION_ITEMS,
  siteContentDraftSchema,
  stripGreeting,
  type SiteContentDraft,
  type WebsiteContent,
  websiteContentSchema,
} from '@gruenerator/contracts';

import { type StructuredValidation } from '../../ai/structuredParsing.js';
import { type Locale } from '../../localization/index.js';

import { actionLinksFor } from './prompt.js';

export const MAX_SECTION_ITEMS = SITE_DRAFT_SECTION_ITEMS;

export function clampSections(content: WebsiteContent): WebsiteContent {
  return {
    ...content,
    themes: content.themes.slice(0, MAX_SECTION_ITEMS),
    actions: content.actions.slice(0, MAX_SECTION_ITEMS),
  };
}

export type PickImage = (text: string, exclude: readonly string[]) => Promise<string>;

/**
 * Picks in parallel, then re-picks a later section's image if an earlier one
 * already uses it (order: hero, themes, actions, contact), so a site never
 * shows the same stock photo twice while alternatives exist.
 *
 * `onUpdate` gets the content with every image known so far, each time one
 * arrives — the live preview shows them one by one. A re-pick reports again.
 */
export async function attachImages(
  content: WebsiteContent,
  pick: PickImage,
  onUpdate?: (content: WebsiteContent) => void
): Promise<WebsiteContent> {
  const texts = [
    `${content.hero_image.title} ${content.hero_image.subtitle}`,
    ...content.themes.map((theme) => `${theme.title} ${theme.content}`),
    ...content.actions.map((action) => action.text),
    `${content.contact.title} Kontakt Politik Grüne`,
  ];
  const urls: string[] = texts.map(() => '');
  const themeStart = 1;
  const actionStart = themeStart + content.themes.length;
  const withUrls = (): WebsiteContent => ({
    ...content,
    hero_image: { ...content.hero_image, imageUrl: urls[0] ?? '' },
    themes: content.themes.map((theme, i) => ({ ...theme, imageUrl: urls[themeStart + i] ?? '' })),
    actions: content.actions.map((action, i) => ({
      ...action,
      imageUrl: urls[actionStart + i] ?? '',
    })),
    contact: { ...content.contact, backgroundImageUrl: urls[urls.length - 1] ?? '' },
  });

  await Promise.all(
    texts.map(async (text, i) => {
      urls[i] = await pick(text, []);
      onUpdate?.(withUrls());
    })
  );

  const used = new Set<string>();
  for (const [i, text] of texts.entries()) {
    let url = urls[i] ?? '';
    if (url !== '' && used.has(url)) {
      url = await pick(text, [...used]);
      urls[i] = url;
      onUpdate?.(withUrls());
    }
    if (url !== '') used.add(url);
  }

  return withUrls();
}

/**
 * The model's arguments so far, as something the client may show: lists cut
 * to the same three items the validator keeps, no contact e-mail and no action
 * links (the draft schema has neither field, so parsing drops them). `null`
 * when the text so far does not have the shape yet.
 */
export function toSiteDraft(input: unknown): SiteContentDraft | null {
  const parsed = siteContentDraftSchema.safeParse(clampLists(dropNulls(input)));
  return parsed.success ? parsed.data : null;
}

function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter((v) => v !== null).map(dropNulls);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry !== null) out[key] = dropNulls(entry);
    }
    return out;
  }
  return value;
}

function clampLists(input: unknown): unknown {
  if (input === null || typeof input !== 'object') return input;
  const out: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  for (const key of ['themes', 'actions']) {
    const list = out[key];
    if (Array.isArray(list)) out[key] = list.slice(0, MAX_SECTION_ITEMS);
  }
  const contact = out.contact;
  if (contact !== null && typeof contact === 'object') {
    out.contact = { ...(contact as Record<string, unknown>), email: '' };
  }
  return out;
}

export function validateWebsiteContent(
  locale: Locale
): (input: unknown) => StructuredValidation<WebsiteContent> {
  const allowed = actionLinksFor(locale);
  return (input) => {
    const parsed = websiteContentSchema.safeParse(clampLists(dropNulls(input)));
    const issues: string[] = [];
    if (!parsed.success) {
      for (const issue of parsed.error.issues.slice(0, 8)) {
        issues.push(`${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
    } else {
      parsed.data.actions.forEach((action, i) => {
        if (!allowed.includes(action.link)) {
          issues.push(`actions.${i}.link: erlaubt sind nur ${allowed.join(', ')}`);
        }
      });
    }
    if (parsed.success && issues.length === 0) {
      const { hero } = parsed.data;
      return {
        ok: true,
        value: { ...parsed.data, hero: { ...hero, heading: stripGreeting(hero.heading) } },
      };
    }
    return { ok: false, error: `Ungültige Seiteninhalte: ${issues.join('; ')}` };
  };
}
