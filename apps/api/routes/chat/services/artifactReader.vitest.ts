/**
 * Reading an artifact back.
 *
 * The gap this closes: every kind had a server-side loader already, but the only
 * TOOL wired to any of them lives in the recall loop. In the agentic loop the
 * nearest thing was `documents` action="get", which returns `{title, url, type}`
 * — a pointer, not the thing. So on 03.08.2026 "vergleiche das PDF und die
 * Präsentation" was not a hard task but an impossible one, and the model
 * answered it from nothing.
 *
 * PDFs are the asymmetric case and get the most attention here: their id is a
 * FILE NAME (`uuid.pdf`), not a collaborative-document UUID, which is why one
 * reached a `$1::uuid` query as a 22P02 and `documents` as "nicht gefunden".
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const loadBoardState = vi.fn();
const loadSheetState = vi.fn();
const loadPresentationState = vi.fn();
const loadDocumentProse = vi.fn();
const extractPdfText = vi.fn();

vi.mock('../../../services/boards/BoardService.js', () => ({
  loadBoardState,
  formatBoardAsContext: (b: { title: string }) => `BOARD ${b.title}`,
}));
vi.mock('../../../services/sheets/SheetGenerationService.js', () => ({
  loadSheetState,
  formatSheetAsContext: (s: { title: string }) => `SHEET ${s.title}`,
}));
vi.mock('../../../services/presentations/PresentationGenerationService.js', () => ({
  loadPresentationState,
  formatPresentationAsContext: (p: { title: string }) => `DECK ${p.title}`,
}));
vi.mock('../../docs/docProseReader.js', () => ({ loadDocumentProse }));
vi.mock('../../../services/pdf/pdfText.js', () => ({ extractPdfText }));

const { readArtifactContent } = await import('./artifactReader.js');

const USER = 'e27c1530-da34-4bd6-b0ac-adc17298d9f7';
const PDF_NAME = '3f1c9d20-4b7e-4a11-9c8d-5e2a7b6f0d43.pdf';
const baseDir = path.join(
  process.env.TMPDIR ?? '/tmp',
  `artifact-reader-${process.pid}`,
  'compute-assets'
);

beforeAll(async () => {
  process.env.COMPUTE_ASSETS_BASE_DIR = baseDir;
  await mkdir(path.join(baseDir, USER), { recursive: true });
  await writeFile(path.join(baseDir, USER, PDF_NAME), Buffer.from('%PDF-1.7 fake'));
});

afterAll(async () => {
  await rm(path.dirname(baseDir), { recursive: true, force: true });
  delete process.env.COMPUTE_ASSETS_BASE_DIR;
});

describe('readArtifactContent', () => {
  it('reads a presentation through its loader', async () => {
    loadPresentationState.mockResolvedValueOnce({ title: 'Klimaziel 2040' });
    await expect(
      readArtifactContent({ id: 'deck-1', kind: 'presentation', userId: USER })
    ).resolves.toBe('DECK Klimaziel 2040');
    expect(loadPresentationState).toHaveBeenCalledWith('deck-1', USER);
  });

  it('reads a sheet, a board and a document through theirs', async () => {
    loadSheetState.mockResolvedValueOnce({ title: 'Budget' });
    loadBoardState.mockResolvedValueOnce({ title: 'Kampagne' });
    loadDocumentProse.mockResolvedValueOnce('Antragstext …');

    await expect(readArtifactContent({ id: 's', kind: 'sheet', userId: USER })).resolves.toBe(
      'SHEET Budget'
    );
    await expect(readArtifactContent({ id: 'b', kind: 'board', userId: USER })).resolves.toBe(
      'BOARD Kampagne'
    );
    await expect(readArtifactContent({ id: 'd', kind: 'doc', userId: USER })).resolves.toBe(
      'Antragstext …'
    );
  });

  it('reads a generated PDF off the asset directory', async () => {
    extractPdfText.mockResolvedValueOnce('EU-Klimaziel 2040 — 90 Prozent');
    await expect(readArtifactContent({ id: PDF_NAME, kind: 'pdf', userId: USER })).resolves.toBe(
      'EU-Klimaziel 2040 — 90 Prozent'
    );
  });

  it('refuses a PDF id that is not a plain asset file name', async () => {
    // The containment check the download route uses. An id is model-supplied,
    // so a path segment must never reach `readFile` (js/path-injection).
    extractPdfText.mockClear();
    for (const id of ['../../../etc/passwd', 'nicht-eine-uuid.pdf', '']) {
      await expect(readArtifactContent({ id, kind: 'pdf', userId: USER })).resolves.toBeNull();
    }
    expect(extractPdfText).not.toHaveBeenCalled();
  });

  it("does not read another user's PDF", async () => {
    await expect(
      readArtifactContent({ id: PDF_NAME, kind: 'pdf', userId: 'someone-else' })
    ).resolves.toBeNull();
  });

  it('returns null instead of throwing when the loader denies access', async () => {
    // Every loader answers "not yours" with null; a tool that threw here would
    // abort a turn the model can still finish honestly.
    loadPresentationState.mockResolvedValueOnce(null);
    await expect(
      readArtifactContent({ id: 'fremd', kind: 'presentation', userId: USER })
    ).resolves.toBeNull();
  });

  it('survives an unreadable PDF without throwing', async () => {
    extractPdfText.mockRejectedValueOnce(new Error('PDF text extraction failed: bad xref'));
    await expect(
      readArtifactContent({ id: PDF_NAME, kind: 'pdf', userId: USER })
    ).resolves.toBeNull();
  });
});
