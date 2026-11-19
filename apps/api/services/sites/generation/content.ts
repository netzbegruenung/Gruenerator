import { type WebsiteContent, websiteContentSchema } from '@gruenerator/contracts';

import { type StructuredValidation } from '../../ai/structuredParsing.js';
import { type Locale } from '../../localization/index.js';

import { actionLinksFor } from './prompt.js';

export const MAX_SECTION_ITEMS = 3;

export function clampSections(content: WebsiteContent): WebsiteContent {
  return {
    ...content,
    themes: content.themes.slice(0, MAX_SECTION_ITEMS),
    actions: content.actions.slice(0, MAX_SECTION_ITEMS),
  };
}

export async function attachImages(
  content: WebsiteContent,
  pick: (text: string) => Promise<string>
): Promise<WebsiteContent> {
  const [heroUrl, themeUrls, actionUrls, contactUrl] = await Promise.all([
    pick(`${content.hero_image.title} ${content.hero_image.subtitle}`),
    Promise.all(content.themes.map((theme) => pick(`${theme.title} ${theme.content}`))),
    Promise.all(content.actions.map((action) => pick(action.text))),
    pick(`${content.contact.title} Kontakt Politik Grüne`),
  ]);

  return {
    ...content,
    hero_image: { ...content.hero_image, imageUrl: heroUrl },
    themes: content.themes.map((theme, i) => ({ ...theme, imageUrl: themeUrls[i] ?? '' })),
    actions: content.actions.map((action, i) => ({ ...action, imageUrl: actionUrls[i] ?? '' })),
    contact: { ...content.contact, backgroundImageUrl: contactUrl },
  };
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
    if (parsed.success && issues.length === 0) return { ok: true, value: parsed.data };
    return { ok: false, error: `Ungültige Seiteninhalte: ${issues.join('; ')}` };
  };
}
