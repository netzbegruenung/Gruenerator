/**
 * Pins that the paths issue #4507 found unrecorded now book their unit:
 * DeepL characters, Mistral OCR pages and embedding tokens.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const recordOperation = vi.fn();
vi.mock('./UsageTrackingService.js', () => ({ recordOperation, recordTokenUsage: vi.fn() }));

const embeddingsCreate = vi.fn();
const ocrProcess = vi.fn();
vi.mock('../ai/mistralClient.js', () => ({
  default: { embeddings: { create: embeddingsCreate }, ocr: { process: ocrProcess } },
}));

vi.mock('../../config/env.js', () => ({
  env: { DEEPL_API_KEY: 'pro-key', LOG_LEVEL: 'warn', MISTRAL_EMBEDDING_CONCURRENCY: 2 },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const { DeepLService } = await import('../translation/DeepLService.js');
const { MistralEmbeddingClient } =
  await import('../mistral/MistralEmbeddingService/MistralEmbeddingClient.js');
const { extractPagesWithMistralOCR } = await import('../OcrService/mistralIntegration.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('new usage units', () => {
  it('books the characters DeepL billed, summed over the batch', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => ({
        translations: [
          { detected_source_language: 'EN', text: 'a', billed_characters: 11 },
          { detected_source_language: 'EN', text: 'b', billed_characters: 4 },
        ],
      }),
    });
    await new DeepLService('pro-key').translateText({ text: ['x', 'y'], targetLang: 'DE' });
    expect(recordOperation).toHaveBeenCalledWith({
      unit: 'characters',
      provider: 'deepl',
      model: 'translate',
      count: 15,
    });
  });

  it('books the pages Mistral OCR processed', async () => {
    ocrProcess.mockResolvedValue({
      pages: [{ index: 0, markdown: 'x' }],
      usageInfo: { pagesProcessed: 3 },
    });
    await extractPagesWithMistralOCR('AAAA', 'application/pdf', [1]);
    expect(recordOperation).toHaveBeenCalledWith(
      expect.objectContaining({ unit: 'ocr_pages', provider: 'mistral', count: 3 })
    );
  });

  it('books embedding tokens from the response usage', async () => {
    embeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2] }],
      usage: { totalTokens: 42 },
    });
    await new MistralEmbeddingClient().generateEmbedding('hallo');
    expect(recordOperation).toHaveBeenCalledWith(
      expect.objectContaining({ unit: 'embedding_tokens', model: 'mistral-embed', count: 42 })
    );
  });
});
