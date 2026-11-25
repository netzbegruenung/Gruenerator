import { describe, expect, it } from 'vitest';

import { liveSiteDraft } from './liveDraft';

describe('liveSiteDraft', () => {
  it('keeps every block id across drafts, so the preview does not remount', () => {
    const early = liveSiteDraft({ hero: { heading: 'Le' }, themes: [{ title: 'Ba' }] }, '');
    const later = liveSiteDraft(
      { hero: { heading: 'Lena' }, themes: [{ title: 'Bäume' }, { title: 'Rad' }] },
      ''
    );
    const ids = (d: typeof early) =>
      d.blocks.map((b) => b.id).filter((id) => id !== 'live-themes-1');
    expect(ids(later)).toEqual(expect.arrayContaining(ids(early)));
    const themes = later.blocks.find((b) => b.type === 'themes');
    expect(themes?.type === 'themes' && themes.items.map((i) => i.id)).toEqual([
      'live-themes-0',
      'live-themes-1',
    ]);
  });

  it('builds a whole page from an empty draft', () => {
    const page = liveSiteDraft({}, 'a@b.de');
    expect(page.site_title).toBe('');
    expect(page.contact_email).toBe('a@b.de');
    expect(page.blocks.map((b) => b.type)).toContain('contact');
  });

  it('gives actions no link while they are written', () => {
    const page = liveSiteDraft({ actions: [{ text: 'Mitmachen' }] }, '');
    const actions = page.blocks.find((b) => b.type === 'actions');
    expect(actions?.type === 'actions' && actions.items[0]?.link).toBe('');
  });
});
