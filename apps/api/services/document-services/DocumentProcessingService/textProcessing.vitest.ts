/**
 * #6144: Eingefügter Text und gecrawlte Seiten speichern ihren Volltext. Ohne
 * `markdown_content` setzt das Notebook den Text aus überlappenden Chunks
 * zusammen, und eine Wortzählung liegt zu hoch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const chunkAndEmbedText = vi.fn();
vi.mock('./chunkingPipeline.js', () => ({
  chunkAndEmbedText: (...args: unknown[]) => chunkAndEmbedText(...args) as unknown,
}));

const { processTextContent } = await import('./textProcessing.js');
const { processUrlContent } = await import('./urlProcessing.js');

const saveDocumentMetadata = vi.fn();
const storeDocumentVectors = vi.fn();
const pg = { saveDocumentMetadata } as never;
const qdrant = { storeDocumentVectors } as never;

beforeEach(() => {
  chunkAndEmbedText.mockReset().mockResolvedValue({ chunks: ['c'], embeddings: [[0.1]] });
  saveDocumentMetadata.mockReset().mockResolvedValue({ id: 'doc-1', title: 'T' });
  storeDocumentVectors.mockReset().mockResolvedValue(undefined);
});

describe('stored full text', () => {
  it('keeps pasted text as markdownContent', async () => {
    await processTextContent(pg, qdrant, 'u1', 'Beschluss', '  Der Radweg kommt 2027.  ');
    expect(saveDocumentMetadata.mock.calls[0]?.[1]).toMatchObject({
      markdownContent: 'Der Radweg kommt 2027.',
    });
  });

  it('keeps crawled text as markdownContent', async () => {
    await processUrlContent(
      pg,
      qdrant,
      'u1',
      'https://example.org/a',
      'Seite',
      'Volltext der Seite'
    );
    expect(saveDocumentMetadata.mock.calls[0]?.[1]).toMatchObject({
      markdownContent: 'Volltext der Seite',
    });
  });
});
