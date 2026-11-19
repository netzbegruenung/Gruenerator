import { buildSitePreviewSnapshot, richTextDocFromPlainText } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { type CandidateData } from '../types/editorDraft';

import { candidateToSnapshotSource } from './candidateToSnapshotSource';

const candidate = (): CandidateData => ({
  id: 's1',
  slug: 'anna',
  hero: {
    imageUrl: '',
    name: 'Anna Beispiel',
    tagline: 'Für eine lebenswerte Stadt',
    socialLinks: {},
  },
  about: { title: 'Wer ich bin', content: richTextDocFromPlainText('Hallo') },
  heroImage: { imageUrl: '', title: 'Gemeinsam', subtitle: '' },
  themes: {
    title: 'Meine Themen',
    themes: [
      { _key: 'k1', imageUrl: '', title: 'Klima', content: richTextDocFromPlainText('Text') },
    ],
  },
  actions: { actions: [{ _key: 'k2', imageUrl: '', text: 'Mitmachen', link: '#kontakt' }] },
  contact: {
    title: 'Kontakt',
    backgroundImageUrl: '',
    email: 'anna@example.org',
    socialMedia: [],
  },
});

describe('candidateToSnapshotSource', () => {
  it('strips client keys and keeps the editor content', () => {
    const src = candidateToSnapshotSource(candidate(), null);
    expect(src.sections?.themes?.[0]).not.toHaveProperty('_key');
    expect(src.sections?.actions?.[0]).not.toHaveProperty('_key');
    expect(src.site_title).toBe('Anna Beispiel');
  });

  it('takes theme, phone, legal and hidden sections from the stored site', () => {
    const src = candidateToSnapshotSource(candidate(), {
      theme: 'hell',
      contact_phone: '+43 1 234',
      legal: { name: 'Anna' },
      sections: { hidden: ['themes'] },
    });
    expect(src).toMatchObject({
      theme: 'hell',
      contact_phone: '+43 1 234',
      legal: { name: 'Anna' },
    });
    expect(src.sections?.hidden).toEqual(['themes']);
  });

  it('previews a half-finished draft without throwing', () => {
    const c = candidate();
    c.actions.actions = [{ imageUrl: '', text: 'Los', link: 'www.halb' }];
    expect(
      buildSitePreviewSnapshot(candidateToSnapshotSource(c, null), 'de-AT').sections.actions?.[0]
        ?.link
    ).toBe('');
  });

  it('drops empty social links', () => {
    const c = candidate();
    c.hero.socialLinks = { instagram: '', mastodon: 'https://gruene.social/@a' };
    expect(candidateToSnapshotSource(c, null).social_links).toEqual({
      mastodon: 'https://gruene.social/@a',
    });
  });
});
