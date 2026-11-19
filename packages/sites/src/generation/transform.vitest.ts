import {
  LEGAL_EMAIL_MAX,
  SITE_ABOUT_MAX_LENGTH,
  SITE_THEME_CONTENT_MAX_LENGTH,
  SITE_ACTIONS_MAX,
  SITE_ACTION_TEXT_MAX,
  SITE_SECTION_TITLE_MAX,
  SITE_TAGLINE_MAX,
  SITE_THEMES_MAX,
  SITE_TITLE_MAX,
  SITE_URL_MAX,
  createSiteBodySchema,
  websiteContentSchema,
  type WebsiteContent,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { transformAiResponse } from './transform';

const s = (n: number) => 'a'.repeat(n);

describe('transformAiResponse', () => {
  it('transformed max-length content passes createSiteBodySchema', () => {
    const content: WebsiteContent = {
      hero: { heading: s(SITE_TITLE_MAX), text: s(SITE_TAGLINE_MAX) },
      about: { title: s(SITE_SECTION_TITLE_MAX), content: s(SITE_ABOUT_MAX_LENGTH) },
      hero_image: {
        title: s(SITE_TITLE_MAX),
        subtitle: s(SITE_TAGLINE_MAX),
        imageUrl: s(SITE_URL_MAX),
      },
      themes: Array.from({ length: SITE_THEMES_MAX }, () => ({
        title: s(SITE_SECTION_TITLE_MAX),
        content: s(SITE_THEME_CONTENT_MAX_LENGTH),
        imageUrl: s(SITE_URL_MAX),
      })),
      actions: Array.from({ length: SITE_ACTIONS_MAX }, () => ({
        text: s(SITE_ACTION_TEXT_MAX),
        link: s(SITE_URL_MAX),
        imageUrl: s(SITE_URL_MAX),
      })),
      contact: {
        title: s(SITE_SECTION_TITLE_MAX),
        email: s(LEGAL_EMAIL_MAX),
        backgroundImageUrl: s(SITE_URL_MAX),
      },
    };
    expect(websiteContentSchema.safeParse(content).success).toBe(true);
    const t = transformAiResponse(content);
    const result = createSiteBodySchema.safeParse({
      subdomain: 'anna',
      site_title: t.site_title,
      tagline: t.tagline,
      contact_email: t.contact_email,
      sections: t.sections,
    });
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });
});
