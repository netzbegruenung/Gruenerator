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

  it('builds the standard page of seven blocks from the content, in order', () => {
    let n = 0;
    const t = transformAiResponse(
      {
        hero: { heading: 'Anna', text: 'Für Musterstadt' },
        about: { title: '', content: 'Hallo' },
        hero_image: { title: 'Gemeinsam', subtitle: 'Sub', imageUrl: '/api/share/x/preview' },
        themes: [{ title: 'Klima', content: 'Solar', imageUrl: '' }],
        actions: [{ text: 'Spenden', link: 'https://example.org' }],
        contact: { title: 'Schreib mir', email: 'a@b.de' },
      },
      () => `id-${(n += 1)}`
    );
    expect(t.sections.blocks.map((block) => block.type)).toEqual([
      'hero',
      'about',
      'heroImage',
      'themes',
      'actions',
      'socialFeed',
      'contact',
    ]);
    expect(t.sections.blocks[1]).toMatchObject({ type: 'about', title: 'Wer ich bin' });
    expect(t.sections.blocks[2]).toMatchObject({
      title: 'Gemeinsam',
      subtitle: 'Sub',
      imageUrl: '/api/share/x/preview',
    });
    expect(t.sections.blocks[3]).toMatchObject({ items: [{ title: 'Klima', imageUrl: '' }] });
    expect(t.sections.blocks[4]).toMatchObject({
      items: [{ text: 'Spenden', link: 'https://example.org', imageUrl: '' }],
    });
    expect(t.sections.blocks[5]).toMatchObject({ type: 'socialFeed', showFeed: false });
    expect(t.sections.blocks[6]).toMatchObject({ title: 'Schreib mir', backgroundImageUrl: '' });
    const ids = t.sections.blocks.flatMap((block) => [
      block.id,
      ...('items' in block ? block.items.map((item) => item.id) : []),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
