/**
 * @vitest-environment jsdom
 *
 * The store triggers the download through a synthetic <a>, so this file needs a
 * DOM even though it asserts only the request body (the node lane is the
 * default for *.vitest.ts).
 *
 * The export request body.
 *
 * Two things have to hold at once, and they pull against each other:
 *  - a call WITHOUT options must send exactly `{content, title}`, because
 *    apps/mobile posts that shape and is not rebuilt when the server changes;
 *  - a call WITH options must forward all of them. Listing the fields by hand
 *    is what silently dropped the letterhead choice once: the caller builds
 *    `options` with conditional spreads, so a forgotten field is invisible to
 *    the type checker and the user just gets the wrong Absender.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const generatePdf = vi.fn();

// Only getContractsClient is replaced — the module also provides
// createApiClient, which the store's sibling import needs for real.
vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ exports: { generatePdf } }),
}));
vi.mock('../../components/utils/titleExtractor', () => ({
  extractFilenameFromContent: () => 'Dokument',
}));

const { useExportStore } = await import('./exportStore');

function lastBody(): Record<string, unknown> {
  return generatePdf.mock.calls.at(-1)![0].body as Record<string, unknown>;
}

beforeEach(() => {
  generatePdf.mockReset().mockResolvedValue({ status: 200, body: new Blob(['%PDF-']) });
  // jsdom gives us createObjectURL only via a stub.
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
});

describe('generatePDF request body', () => {
  it('sends exactly content and title when no options are given', async () => {
    await useExportStore.getState().generatePDF('<p>Text</p>', 'Titel');

    expect(Object.keys(lastBody()).sort()).toEqual(['content', 'title']);
  });

  it('forwards the chosen letterhead', async () => {
    await useExportStore
      .getState()
      .generatePDF('<p>Text</p>', 'Titel', { layout: 'letterhead', letterheadId: 'lh-1' });

    expect(lastBody()).toMatchObject({ layout: 'letterhead', letterheadId: 'lh-1' });
  });

  it('forwards an Absender typed in the dialog', async () => {
    await useExportStore.getState().generatePDF('<p>Text</p>', 'Titel', {
      layout: 'letterhead',
      letterhead: { organization: 'KV Musterstadt', address: 'Weg 1\n12345 Ort' },
    });

    expect(lastBody().letterhead).toEqual({
      organization: 'KV Musterstadt',
      address: 'Weg 1\n12345 Ort',
    });
  });

  it('forwards the DIN-5008 fields of a letter', async () => {
    await useExportStore.getState().generatePDF('<p>Text</p>', 'Titel', {
      layout: 'letter',
      letterheadId: 'lh-1',
      letter: { recipient: 'Testperson\nWeg 1\n12345 Ort', subject: 'Betreff' },
    });

    const body = lastBody();
    expect(body.layout).toBe('letter');
    expect(body.letterheadId).toBe('lh-1');
    expect((body.letter as { subject: string }).subject).toBe('Betreff');
  });

  it('surfaces the server’s explanation instead of a bare status code', async () => {
    generatePdf.mockResolvedValue({
      status: 400,
      body: { success: false, message: 'Für den Briefkopf sind keine Absenderangaben vorhanden.' },
    });

    await expect(
      useExportStore.getState().generatePDF('<p>Text</p>', 'Titel', { layout: 'letterhead' })
    ).rejects.toThrow(/Absenderangaben/);
  });
});
