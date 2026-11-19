import { richTextDocFromPlainText, siteDraftFromSite, type Site } from '@gruenerator/contracts';
import { decodeSiteDraft, encodeSiteSeed } from '@gruenerator/contracts/site-ydoc';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

const hocuspocusInternal = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<unknown>>());
const hocuspocusInternalOrNull = vi.hoisted(() =>
  vi.fn<(...a: unknown[]) => Promise<unknown | null>>()
);
vi.mock('../collab/hocuspocusInternal.js', () => ({
  hocuspocusInternal,
  hocuspocusInternalOrNull,
}));

const { ensureSiteDraft, readSiteDraft, siteRoom, UnseededSiteDraftError } =
  await import('./siteDraftDoc.js');

const SITE_ID = '33333333-3333-4333-8333-333333333333';

function site(): Site {
  return {
    id: SITE_ID,
    user_id: '11111111-1111-4111-8111-111111111111',
    subdomain: 'anna',
    is_published: false,
    site_title: 'Anna Beispiel',
    tagline: null,
    contact_email: 'anna@example.org',
    contact_phone: '+49 30 123',
    contact_website: null,
    social_links: {},
    theme: 'dunkel',
    accent_color: null,
    profile_image: null,
    background_image: null,
    sections: {
      hidden: ['actions'],
      about: { title: 'Wer ich bin', content: richTextDocFromPlainText('Hallo') },
    },
    legal: null,
    created_at: null,
    updated_at: null,
    last_published: null,
    visit_count: 0,
    meta_description: null,
    meta_keywords: null,
    moderation: 'ok',
    has_unpublished_changes: false,
    published_snapshot: null,
  } as Site;
}

const b64 = (update: Uint8Array) => Buffer.from(update).toString('base64');
const yjsAnswer = (update: Uint8Array) => ({ update: b64(update), live: false });

beforeEach(() => {
  hocuspocusInternal.mockReset();
  hocuspocusInternalOrNull.mockReset();
});

describe('siteDraftDoc', () => {
  it('ensureSiteDraft seeds from the row when the doc has no state', async () => {
    hocuspocusInternalOrNull.mockResolvedValueOnce(null);
    hocuspocusInternal.mockResolvedValueOnce({ seeded: true });

    expect(await ensureSiteDraft(site())).toEqual({ seeded: true });

    expect(hocuspocusInternalOrNull).toHaveBeenCalledWith(
      'GET',
      `/internal/doc/site-${SITE_ID}/yjs`
    );
    const [method, path, body] = hocuspocusInternal.mock.calls[0] as [
      string,
      string,
      { update: string },
    ];
    expect(method).toBe('POST');
    expect(path).toBe(`/internal/site/${SITE_ID}/seed`);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(Buffer.from(body.update, 'base64')));
    const draft = decodeSiteDraft(doc);
    expect(draft.contact_phone).toBe('+49 30 123');
    expect(draft.hidden).toEqual(['actions']);
  });

  it('ensureSiteDraft does nothing when state exists', async () => {
    hocuspocusInternalOrNull.mockResolvedValueOnce(
      yjsAnswer(encodeSiteSeed(siteDraftFromSite(site()), '2026-11-19T10:00:00Z'))
    );

    expect(await ensureSiteDraft(site())).toEqual({ seeded: false });
    expect(hocuspocusInternal).not.toHaveBeenCalled();
  });

  it('ensureSiteDraft reports a seed that lost the race as success', async () => {
    hocuspocusInternalOrNull.mockResolvedValueOnce(null);
    hocuspocusInternal.mockResolvedValueOnce({ seeded: false });

    expect(await ensureSiteDraft(site())).toEqual({ seeded: false });
  });

  it('ensureSiteDraft throws when the seed is refused (413)', async () => {
    hocuspocusInternalOrNull.mockResolvedValueOnce(null);
    hocuspocusInternal.mockRejectedValueOnce(new Error('internal POST returned 413'));

    await expect(ensureSiteDraft(site())).rejects.toThrow(/413/);
  });

  it('ensureSiteDraft throws for state that was never seeded', async () => {
    const doc = new Y.Doc();
    doc.getMap('stray').set('x', 1);
    hocuspocusInternalOrNull.mockResolvedValueOnce(yjsAnswer(Y.encodeStateAsUpdate(doc)));

    await expect(ensureSiteDraft(site())).rejects.toBeInstanceOf(UnseededSiteDraftError);
    expect(hocuspocusInternal).not.toHaveBeenCalled();
  });

  it('readSiteDraft returns null on 404 and throws on 500', async () => {
    hocuspocusInternalOrNull.mockResolvedValueOnce(null);
    expect(await readSiteDraft(SITE_ID)).toBeNull();

    hocuspocusInternalOrNull.mockRejectedValueOnce(new Error('internal GET returned 500'));
    await expect(readSiteDraft(SITE_ID)).rejects.toThrow(/500/);
  });

  it('readSiteDraft decodes a seeded doc', async () => {
    const draft = { ...siteDraftFromSite(site()), site_title: 'Neu' };
    hocuspocusInternalOrNull.mockResolvedValueOnce(
      yjsAnswer(encodeSiteSeed(draft, '2026-11-19T10:00:00Z'))
    );

    expect((await readSiteDraft(SITE_ID))?.site_title).toBe('Neu');
  });

  it('readSiteDraft throws for state that was never seeded', async () => {
    const doc = new Y.Doc();
    doc.getMap('stray').set('x', 1);
    hocuspocusInternalOrNull.mockResolvedValueOnce(yjsAnswer(Y.encodeStateAsUpdate(doc)));

    await expect(readSiteDraft(SITE_ID)).rejects.toBeInstanceOf(UnseededSiteDraftError);
  });

  it('names the room site-<id>', () => {
    expect(siteRoom(SITE_ID)).toBe(`site-${SITE_ID}`);
  });
});
