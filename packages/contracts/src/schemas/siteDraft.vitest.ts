import { describe, expect, it } from 'vitest';

import { emptyRichTextDoc, richTextDocFromPlainText } from './richtext.js';
import {
  siteDraftFromSite,
  siteDraftToRowColumns,
  siteDraftToSnapshotSource,
  snapshotDiffers,
} from './siteDraft.js';
import {
  buildSiteSnapshot,
  buildSitePreviewSnapshot,
  type PublishedSiteSnapshot,
  type SiteSnapshotSource,
} from './sites.js';

const legal = {
  name: 'Anna Beispiel',
  street: 'Hauptstraße 1',
  postal_code: '10115',
  city: 'Berlin',
  email: 'anna@example.org',
};

const row = (): SiteSnapshotSource => ({
  site_title: 'Anna Beispiel',
  tagline: 'Für eine lebenswerte Stadt',
  profile_image: '/api/share/abcdef123456/download',
  theme: 'hell',
  contact_email: 'anna@example.org',
  contact_phone: '+49 30 123',
  social_links: { mastodon: 'https://gruene.social/@a' },
  legal,
  sections: {
    hidden: ['actions'],
    about: { title: 'Wer ich bin', content: richTextDocFromPlainText('Hallo') },
    heroImage: { imageUrl: '', title: 'Gemeinsam', subtitle: 'Sub' },
    themes: [
      { imageUrl: '', title: 'Klima', content: richTextDocFromPlainText('Text') },
      { imageUrl: '', title: 'Verkehr', content: richTextDocFromPlainText('Mehr') },
    ],
    actions: [{ imageUrl: '', text: 'Mitmachen', link: '#kontakt' }],
    contact: { title: 'Kontakt', backgroundImageUrl: '' },
    socialFeed: { title: 'Instagram', instagramUsername: 'anna', showFeed: true },
  },
});

describe('site draft', () => {
  it('keeps the phone and the hidden sections of the row (#5801)', () => {
    const draft = siteDraftFromSite(row());
    expect(draft.contact_phone).toBe('+49 30 123');
    expect(draft.hidden).toEqual(['actions']);
    expect(siteDraftToRowColumns(draft).sections.hidden).toEqual(['actions']);
  });

  it('round-trips row → draft → source without changing the snapshot', () => {
    const source = row();
    const back = siteDraftToSnapshotSource(siteDraftFromSite(source), source.legal);
    expect(buildSiteSnapshot(back, 'de-AT')).toEqual(buildSiteSnapshot(source, 'de-AT'));
  });

  it('gives every theme and action a distinct id and drops it on the way out', () => {
    const draft = siteDraftFromSite(row());
    const ids = [...draft.themes, ...draft.actions].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(siteDraftToRowColumns(draft).sections.themes?.[0]).not.toHaveProperty('id');
    expect(siteDraftToRowColumns(draft).sections.actions?.[0]).not.toHaveProperty('id');
  });

  it('fills the defaults of a row without sections', () => {
    const draft = siteDraftFromSite({ ...row(), sections: null, theme: null, contact_phone: null });
    expect(draft).toMatchObject({
      variant: 'dunkel',
      contact_phone: '',
      hidden: [],
      about: { title: 'Wer ich bin' },
      heroImage: { title: 'Gemeinsam für eine nachhaltige Zukunft!' },
      contact: { title: 'Kontakt' },
      socialFeed: { title: 'Instagram', instagramUsername: '', showFeed: false },
    });
  });

  it('snapshotDiffers is false for the same source, true after a title change', () => {
    const source = row();
    const built = buildSiteSnapshot(source, 'de-DE');
    if (!built.ok) throw new Error('fixture must be valid');
    expect(snapshotDiffers(source, built.snapshot)).toBe(false);
    expect(snapshotDiffers({ ...source, site_title: 'Neu' }, built.snapshot)).toBe(true);
    expect(snapshotDiffers({ ...source, legal: null }, built.snapshot)).toBe(true);
  });

  it('treats every spelling of an empty rich text as unchanged', () => {
    const source = row();
    source.sections = {
      ...source.sections,
      about: { title: 'Wer ich bin', content: emptyRichTextDoc() },
    };
    const built = buildSiteSnapshot(source, 'de-DE');
    if (!built.ok) throw new Error('fixture must be valid');
    const withAbout = (content: unknown): PublishedSiteSnapshot =>
      JSON.parse(
        JSON.stringify({
          ...built.snapshot,
          sections: {
            ...built.snapshot.sections,
            about: { title: 'Wer ich bin', content },
          },
        })
      );
    for (const content of [
      { type: 'doc' },
      { type: 'doc', content: [] },
      { type: 'doc', content: [{ type: 'paragraph' }] },
      { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
    ]) {
      expect(snapshotDiffers(source, withAbout(content))).toBe(false);
    }
    expect(
      snapshotDiffers(
        source,
        withAbout({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
        })
      )
    ).toBe(true);
  });

  it('previews a half-finished draft without throwing', () => {
    const draft = siteDraftFromSite(row());
    draft.actions = [{ id: 'a', imageUrl: '', text: 'Los', link: 'www.halb' }];
    expect(
      buildSitePreviewSnapshot(siteDraftToSnapshotSource(draft, legal), 'de-AT').sections
        .actions?.[0]?.link
    ).toBe('');
  });

  it('drops empty social links in the snapshot', () => {
    const draft = siteDraftFromSite(row());
    draft.social_links = { instagram: '', mastodon: 'https://gruene.social/@a' };
    expect(
      buildSitePreviewSnapshot(siteDraftToSnapshotSource(draft, legal), 'de-AT').social_links
    ).toEqual({ mastodon: 'https://gruene.social/@a' });
  });
});
