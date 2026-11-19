import { describe, expect, it } from 'vitest';

import { siteGenerateBodySchema, siteGenerationEventSchema } from './siteGeneration.js';
import { SITE_ACTION_TEXT_MAX, SITE_TAGLINE_MAX } from './sites.js';
import { websiteContentSchema } from './texte.js';

const content = (over: { actionText?: string; heroText?: string; heading?: string } = {}) => ({
  hero: { heading: over.heading ?? 'Hallo', text: over.heroText ?? 'Text' },
  about: { title: 'Über mich', content: 'Inhalt' },
  hero_image: { title: 't', subtitle: 's' },
  themes: [{ title: 'Klima', content: 'x' }],
  actions: [{ text: over.actionText ?? 'Mitmachen', link: '#kontakt' }],
  contact: { title: 'Kontakt', email: '' },
});

describe('siteGenerateBodySchema', () => {
  it('accepts a description at the limits', () => {
    expect(siteGenerateBodySchema.safeParse({ description: 'a'.repeat(50) }).success).toBe(true);
    expect(siteGenerateBodySchema.safeParse({ description: 'a'.repeat(5000) }).success).toBe(true);
  });
  it('rejects a description outside the limits', () => {
    expect(siteGenerateBodySchema.safeParse({ description: 'a'.repeat(49) }).success).toBe(false);
    expect(siteGenerateBodySchema.safeParse({ description: 'a'.repeat(5001) }).success).toBe(false);
  });
  it('accepts an empty or valid e-mail and rejects a long or invalid one', () => {
    expect(siteGenerateBodySchema.safeParse({ email: '' }).success).toBe(true);
    expect(siteGenerateBodySchema.safeParse({ email: 'a@b.de' }).success).toBe(true);
    expect(siteGenerateBodySchema.safeParse({ email: 'x' }).success).toBe(false);
    expect(siteGenerateBodySchema.safeParse({ email: 'a@b.' + 'c'.repeat(260) }).success).toBe(
      false
    );
  });
});

describe('siteGenerationEventSchema', () => {
  it('parses every event type', () => {
    for (const e of [
      { type: 'start', steps: ['extract', 'write'] },
      { type: 'step', step: 'analyze' },
      { type: 'done', content: content() },
      { type: 'error', message: 'm', retryable: true },
      { type: 'heartbeat' },
    ]) {
      expect(siteGenerationEventSchema.safeParse(e).success).toBe(true);
    }
  });
  it('rejects an unknown step', () => {
    expect(siteGenerationEventSchema.safeParse({ type: 'step', step: 'ocr' }).success).toBe(false);
  });
});

describe('websiteContentSchema bounds', () => {
  it('bounds website content to the site limits', () => {
    const ok = (c: ReturnType<typeof content>) => websiteContentSchema.safeParse(c).success;
    expect(ok(content({ actionText: 'x'.repeat(SITE_ACTION_TEXT_MAX) }))).toBe(true);
    expect(ok(content({ actionText: 'x'.repeat(SITE_ACTION_TEXT_MAX + 1) }))).toBe(false);
    expect(ok(content({ heroText: 'x'.repeat(SITE_TAGLINE_MAX) }))).toBe(true);
    expect(ok(content({ heroText: 'x'.repeat(SITE_TAGLINE_MAX + 1) }))).toBe(false);
    expect(ok(content({ heading: '  ' }))).toBe(false);
  });
});
