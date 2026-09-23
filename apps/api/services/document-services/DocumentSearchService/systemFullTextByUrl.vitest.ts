/**
 * Clients hold the resolved Wolke share link (search shows it), but the payload
 * stores `wolke://<key>/<pfad>` — the lookup must filter on the stored form.
 */
import { describe, expect, it, vi } from 'vitest';

import { DocumentSearchService } from './DocumentSearchService.js';

vi.mock('../../scrapers/utils/wolkeShareSecrets.js', () => ({
  resolveWolkeDisplayUrl: (url: string) => url,
  toStoredWolkeUrl: (url: string) =>
    url.replace('https://wolke.netzbegruenung.de/s/TESTTOKEN#/', 'wolke://be-share/'),
}));

describe('getSystemDocumentFullTextByUrl', () => {
  it('filters on the stored wolke:// key when given the resolved link', async () => {
    const scrollDocuments = vi.fn(async () => [
      { payload: { full_text: 'Volltext', title: 'Antwort' } },
    ]);
    const service = new DocumentSearchService();
    Object.assign(service, { initialized: true, qdrantOps: { scrollDocuments } });

    const out = await service.getSystemDocumentFullTextByUrl(
      'landesverbaende_documents',
      'https://wolke.netzbegruenung.de/s/TESTTOKEN#/WPS/Antwort.pdf'
    );

    expect(out.fullText).toBe('Volltext');
    const filter = (scrollDocuments.mock.calls[0] as unknown as [string, any])[1];
    expect(filter.must[0]).toEqual({
      key: 'source_url',
      match: { value: 'wolke://be-share/WPS/Antwort.pdf' },
    });
  });
});
