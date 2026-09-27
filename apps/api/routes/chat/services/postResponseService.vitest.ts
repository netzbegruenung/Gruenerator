/**
 * Turn-persistence tests for persistResumedResponse (resume path, WP-B).
 *
 * Focus: the finalize-else-insert switch — a pendingMessageId flips the
 * placeholder row to 'complete' (finalizeAssistantMessage); its absence falls
 * back to createMessage; and a vanished row (finalize miss) is NOT re-inserted
 * and skips the post-persist side effects. threadPersistenceService is mocked
 * so we assert the branch taken rather than hitting Postgres.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMessage = vi.fn();
const finalizeAssistantMessage = vi.fn();
const touchThread = vi.fn();
const setThreadToolContext = vi.fn();
const saveThreadAttachment = vi.fn();
const embedThreadAttachmentForRag = vi.fn();

vi.mock('./threadPersistenceService.js', () => ({
  createMessage,
  finalizeAssistantMessage,
  touchThread,
  setThreadToolContext,
}));

vi.mock('./attachmentPersistenceService.js', () => ({
  saveThreadAttachment,
  embedThreadAttachmentForRag,
  RAG_ATTACHMENT_THRESHOLD_CHARS: 20_000,
}));

const { persistResumedResponse } = await import('./postResponseService.js');

// Minimal ChatGraphState-shaped stub — persistResumedResponse only reads
// intent/searchCount/citations/searchResults/computedResult(+Fresh) off it.
const finalState = {
  intent: 'direct',
  searchCount: 0,
  citations: [],
  searchResults: [],
} as unknown as Parameters<typeof persistResumedResponse>[0]['finalState'];

const base = {
  threadId: 'thread-1',
  fullText: 'Die Antwort.',
  finalState,
  classifiedState: finalState,
};

beforeEach(() => {
  createMessage.mockReset().mockResolvedValue(undefined);
  finalizeAssistantMessage.mockReset().mockResolvedValue(true);
  touchThread.mockReset().mockResolvedValue(undefined);
  setThreadToolContext.mockReset().mockResolvedValue(undefined);
  saveThreadAttachment.mockReset().mockResolvedValue('attachment-1');
  embedThreadAttachmentForRag.mockReset().mockResolvedValue('doc-new');
});

/**
 * Zwei Stellen vektorisieren denselben Anhang: `enrichContext` VOR der Antwort
 * und diese Persistenz DANACH. Bis zum 13.08.2026 wussten sie nichts
 * voneinander — jede legte eine eigene Qdrant-id an, und `getThreadAttachments`
 * reichte dem nächsten Turn beide Kopien zurück. Gemessen: acht ids für eine
 * .docx über vier Turns, `material=286075c` für 57.215 Zeichen Text.
 *
 * Die Naht ist `meta.documentId`. Ist sie gesetzt, hat es schon jemand getan.
 */
describe('Anhänge werden nicht zweimal eingebettet', () => {
  const grosserText = 'x'.repeat(57_215);
  const meta = (over: Record<string, unknown> = {}) => ({
    name: 'Grundlagenpapier.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sizeBytes: 676_042,
    isImage: false,
    extractedText: grosserText,
    ...over,
  });

  it('bettet nicht erneut ein, wenn enrichContext es schon getan hat', async () => {
    await persistResumedResponse({
      ...base,
      userId: 'user-1',
      processedMeta: [meta({ documentId: '61f23708-516b-48c9-b977-404610b77bf2' })] as never,
    });

    expect(embedThreadAttachmentForRag).not.toHaveBeenCalled();
    // …und die vorhandene id steht in der Zeile, sonst fände sie kein
    // Folge-Turn wieder und der zweite Schreiber wäre nur verschoben.
    expect(saveThreadAttachment.mock.calls[0]![0]).toMatchObject({
      documentId: '61f23708-516b-48c9-b977-404610b77bf2',
    });
  });

  it('bettet weiterhin ein, wenn niemand es getan hat (Resume-Pfad)', async () => {
    await persistResumedResponse({
      ...base,
      userId: 'user-1',
      processedMeta: [meta()] as never,
    });

    expect(embedThreadAttachmentForRag).toHaveBeenCalledTimes(1);
    expect(saveThreadAttachment.mock.calls[0]![0]).not.toHaveProperty('documentId');
  });

  it('lässt einen kleinen Anhang unvektorisiert', async () => {
    await persistResumedResponse({
      ...base,
      userId: 'user-1',
      processedMeta: [meta({ extractedText: 'x'.repeat(3_000) })] as never,
    });

    expect(embedThreadAttachmentForRag).not.toHaveBeenCalled();
  });
});

describe('persistResumedResponse turn persistence', () => {
  it('finalizes the placeholder row when pendingMessageId is given', async () => {
    await persistResumedResponse({ ...base, pendingMessageId: 'pending-1' });

    expect(finalizeAssistantMessage).toHaveBeenCalledTimes(1);
    const [id, content, metadata] = finalizeAssistantMessage.mock.calls[0];
    expect(id).toBe('pending-1');
    expect(content).toBe('Die Antwort.');
    expect((metadata as { resumed?: boolean }).resumed).toBe(true);
    expect(createMessage).not.toHaveBeenCalled();
    expect(touchThread).toHaveBeenCalledWith('thread-1');
  });

  it('inserts a new message when no pendingMessageId is given', async () => {
    await persistResumedResponse(base);

    expect(createMessage).toHaveBeenCalledTimes(1);
    const [threadId, role, content] = createMessage.mock.calls[0];
    expect(threadId).toBe('thread-1');
    expect(role).toBe('assistant');
    expect(content).toBe('Die Antwort.');
    expect(finalizeAssistantMessage).not.toHaveBeenCalled();
    expect(touchThread).toHaveBeenCalledWith('thread-1');
  });

  it('inserts a new message when pendingMessageId is null (degraded path)', async () => {
    await persistResumedResponse({ ...base, pendingMessageId: null });

    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(finalizeAssistantMessage).not.toHaveBeenCalled();
  });

  it('does NOT re-insert, skips side effects, and reports discarded:true when the placeholder vanished', async () => {
    finalizeAssistantMessage.mockResolvedValueOnce(false);

    const outcome = await persistResumedResponse({ ...base, pendingMessageId: 'pending-gone' });

    expect(finalizeAssistantMessage).toHaveBeenCalledTimes(1);
    expect(createMessage).not.toHaveBeenCalled();
    expect(touchThread).not.toHaveBeenCalled();
    // `ok: true` alone is indistinguishable from a real success — callers
    // need `discarded` to tell the client instead of leaving it waiting.
    expect(outcome).toEqual({ ok: true, discarded: true });
  });
});

/**
 * The resume path used to drop createdDocument while the normal path persisted
 * it, so an artifact created on a resumed turn lost its card on reload AND left
 * the thread's sticky pointer on the previous turn's artifact.
 */
describe('persistResumedResponse keeps a created artifact', () => {
  const createdDocument = {
    documentId: 'b3b6f307-90b7-465a-a5fe-d76ae8a0d69c.pdf',
    title: 'Fact Sheet',
    subtype: 'pdf',
    url: '/api/chat-service/compute-assets/b3b6f307-90b7-465a-a5fe-d76ae8a0d69c.pdf',
  };

  it('persists createdDocument so the card rehydrates on reload', async () => {
    await persistResumedResponse({ ...base, createdDocument });

    const [, , , metadata] = createMessage.mock.calls[0];
    expect((metadata as { createdDocument?: unknown }).createdDocument).toEqual(createdDocument);
  });

  it('writes the sticky tool context the next turn classifies against', async () => {
    await persistResumedResponse({ ...base, createdDocument });

    expect(setThreadToolContext).toHaveBeenCalledWith('thread-1', {
      kind: 'pdf',
      ref: createdDocument.documentId,
      label: 'Fact Sheet',
    });
  });

  it('leaves the pointer untouched on a plain turn', async () => {
    await persistResumedResponse(base);

    expect(setThreadToolContext).not.toHaveBeenCalled();
  });
});
