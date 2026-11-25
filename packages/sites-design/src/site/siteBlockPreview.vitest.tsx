import { SITE_BLOCK_TYPES, previewSiteSnapshotSchema } from '@gruenerator/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { sampleBlockSnapshot } from '../model/samples.js';

import { SiteBlockPreview } from './SiteBody.js';

const THUMB_SIZE = '?w=400&fmt=webp';
const PICKABLE = SITE_BLOCK_TYPES.filter((spec) => !spec.pinned).map((spec) => spec.type);

describe('SiteBlockPreview', () => {
  it.each(PICKABLE)('renders the %s example filled in, without header and footer', (type) => {
    const markup = renderToStaticMarkup(
      <SiteBlockPreview snapshot={sampleBlockSnapshot(type, 'de-DE', 'dunkel')} />
    );
    expect([...markup.matchAll(/data-block-type="([a-zA-Z]+)"/g)].map((m) => m[1])).toEqual([type]);
    expect(markup).not.toContain('<header');
    expect(markup).not.toContain('<footer');
    // Placeholders mark empty fields; an example card has none.
    expect(markup).not.toContain('data-empty');
  });

  it('holds only content the editor preview accepts unchanged', () => {
    // Cards ask for a fixed small image size; a stored page holds the bare URL, so the check
    // runs on that.
    const bare = (value: unknown) =>
      JSON.parse(JSON.stringify(value).replaceAll(THUMB_SIZE, '')) as unknown;
    for (const type of PICKABLE) {
      for (const locale of ['de-DE', 'de-AT'] as const) {
        const sample = bare(sampleBlockSnapshot(type, locale, 'hell')) as ReturnType<
          typeof sampleBlockSnapshot
        >;
        // The preview schema falls back on bad values instead of throwing; equal means none did.
        const parsed = previewSiteSnapshotSchema.parse(sample);
        expect(parsed.sections.blocks.find((block) => block.type === type)).toEqual(
          sample.sections.blocks[0]
        );
        expect(parsed.contact_email).toBe(sample.contact_email);
        expect(parsed.contact_phone).toBe(sample.contact_phone);
        expect(parsed.social_links).toEqual(sample.social_links);
      }
    }
  });

  it('asks for card-sized images, not the srcset of the 1200px frame', () => {
    const markup = renderToStaticMarkup(
      <SiteBlockPreview snapshot={sampleBlockSnapshot('heroImage', 'de-DE', 'dunkel')} />
    );
    expect(markup).toContain(`unsplash.jpg${THUMB_SIZE.replaceAll('&', '&amp;')}"`);
    expect(markup).not.toContain('srcSet');
  });

  it('takes the variant ground of the block', () => {
    const contact = (variant: 'dunkel' | 'leuchtend') =>
      renderToStaticMarkup(
        <SiteBlockPreview snapshot={sampleBlockSnapshot('contact', 'de-DE', variant)} />
      );
    expect(contact('dunkel')).toMatch(/<section[^>]*data-ground="deep"/);
    expect(contact('leuchtend')).toMatch(/<section[^>]*data-ground="vivid"/);
  });
});
