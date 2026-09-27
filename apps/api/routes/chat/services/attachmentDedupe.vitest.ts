/**
 * One row per file per thread.
 *
 * The client re-sends the file bytes on any turn whose last user message still
 * carries them (edit-resubmit, regenerate, a repeated paste). `saveThreadAttachment`
 * was a plain INSERT, so each of those turns added a row — and every row was
 * injected into the prompt in full AND paid for its own LLM summary. Measured on
 * beta 20.08.2026: a 5794-char file reached the model as 11588 chars, with two
 * summaries billed and neither ever used (the prompt reads `extracted_text`).
 *
 * Run: `npx vitest run routes/chat/services/attachmentDedupe.vitest.ts`
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const generateTextMock = vi.fn();

vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mockQuery }),
}));

vi.mock('ai', () => ({ generateText: generateTextMock }));

vi.mock('../agents/providers.js', () => ({
  getIntermediateModel: () => 'stub-model',
}));

vi.mock('../../../services/vision/VisionService.js', () => ({
  visionService: { describeImage: vi.fn(async () => 'Bildbeschreibung') },
}));

const { saveThreadAttachment, attachmentContentHash } =
  await import('./attachmentPersistenceService.js');

const TEXT = 'Die Grünen drängen auf einen Hitze-Aktionsplan. '.repeat(30);

const params = (over: Record<string, unknown> = {}) => ({
  threadId: 'thread-1',
  messageId: 'msg-1',
  userId: 'user-1',
  name: 'Eingefügter Text.txt',
  mimeType: 'text/plain',
  sizeBytes: TEXT.length,
  isImage: false,
  extractedText: TEXT,
  ...over,
});

/** Wait out the fire-and-forget summary job the insert path may start. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  mockQuery.mockReset();
  generateTextMock.mockReset();
  generateTextMock.mockResolvedValue({ text: 'Kurzfassung' });
});

describe('attachmentContentHash', () => {
  it('identifies a document by its text, not by its file name', () => {
    expect(attachmentContentHash({ extractedText: TEXT, name: 'a.txt', sizeBytes: 1 })).toBe(
      attachmentContentHash({ extractedText: TEXT, name: 'ganz-anders.txt', sizeBytes: 999 })
    );
  });

  it('ignores surrounding whitespace, matching the SQL backfill (btrim)', () => {
    expect(attachmentContentHash({ extractedText: `\n  ${TEXT}\t`, name: 'a', sizeBytes: 1 })).toBe(
      attachmentContentHash({ extractedText: TEXT, name: 'a', sizeBytes: 1 })
    );
  });

  it('falls back to name + size when there is no extracted text (images, binaries)', () => {
    const image = { extractedText: null, name: 'foto.jpg', sizeBytes: 4096 };
    expect(attachmentContentHash(image)).toBe(attachmentContentHash({ ...image }));
    expect(attachmentContentHash(image)).not.toBe(
      attachmentContentHash({ ...image, sizeBytes: 4097 })
    );
  });

  it('treats empty extracted text like no text at all', () => {
    // An OCR run that yielded nothing must not make every such file identical.
    expect(attachmentContentHash({ extractedText: '   ', name: 'a.pdf', sizeBytes: 10 })).toBe(
      attachmentContentHash({ extractedText: null, name: 'a.pdf', sizeBytes: 10 })
    );
  });
});

describe('saveThreadAttachment — a re-sent file does not become a second row', () => {
  it('writes the row and starts one summary on first sight', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 'att-1' }]);

    const id = await saveThreadAttachment(params());
    await settle();

    expect(id).toBe('att-1');
    const [sql, values] = mockQuery.mock.calls[0];
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('DO NOTHING');
    // The hash travels with the insert, not as a separate round trip.
    expect(values).toContain(attachmentContentHash(params()));
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it('reuses the existing row and skips the summary when the insert conflicts', async () => {
    // DO NOTHING returns no rows …
    mockQuery.mockResolvedValueOnce([]);
    // … so the service looks up the row that is already there.
    mockQuery.mockResolvedValueOnce([{ id: 'att-1' }]);

    const id = await saveThreadAttachment(params({ messageId: 'msg-2' }));
    await settle();

    expect(id).toBe('att-1');
    // This is the money: no second LLM call for bytes we already summarised.
    expect(generateTextMock).not.toHaveBeenCalled();

    const [lookupSql, lookupValues] = mockQuery.mock.calls[1];
    expect(lookupSql).toContain('content_hash = $2');
    expect(lookupValues).toEqual(['thread-1', attachmentContentHash(params())]);
  });

  it('does not throw when the conflicting row vanished between the two queries', async () => {
    mockQuery.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce([]);

    // Post-response path: an exception here would lose the whole persistence
    // step for the turn, so it degrades instead.
    await expect(saveThreadAttachment(params())).resolves.toEqual(expect.any(String));
    await settle();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('still stores two genuinely different files in the same thread', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 'att-1' }]);
    await saveThreadAttachment(params());

    mockQuery.mockResolvedValueOnce([{ id: 'att-2' }]);
    const second = await saveThreadAttachment(
      params({ name: 'Radwege.txt', extractedText: 'Ein anderes Dokument. '.repeat(30) })
    );
    await settle();

    expect(second).toBe('att-2');
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });
});
