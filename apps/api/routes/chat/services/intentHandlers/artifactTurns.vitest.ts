import { describe, it, expect, vi, beforeEach } from 'vitest';

import { type ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';

/**
 * The dispatch these handlers perform is thin but load-bearing: each one names
 * exactly one artifact spec, and the document handler forks between owning the
 * turn and contributing to somebody else's. Getting the pairing wrong produces
 * a sheet where a presentation was asked for — with no type error to catch it,
 * since every spec has the same shape.
 */

const SHEET_SPEC = { intent: 'create_sheet' };
const PRESENTATION_SPEC = { intent: 'create_presentation' };
const PDF_SPEC = { intent: 'create_pdf' };
const BOARD_SPEC = { intent: 'create_board' };
const generateDoc = vi.fn<() => Promise<unknown>>();
const makeDocumentSpec = vi.fn((o: { intent: string }) => ({
  intent: o.intent,
  contextKind: 'document',
  generate: generateDoc,
}));
vi.mock('../artifactKinds.js', () => ({
  SHEET_SPEC,
  PRESENTATION_SPEC,
  PDF_SPEC,
  BOARD_SPEC,
  makeDocumentSpec: (o: { intent: string }) => makeDocumentSpec(o),
}));

const runCreateTurn = vi.fn(async () => true);
const emitArtifactResult = vi.fn();
vi.mock('../createTurn.js', () => ({
  runCreateTurn: (spec: unknown, opts: unknown) => runCreateTurn(spec as never, opts as never),
  emitArtifactResult: (...a: unknown[]) => emitArtifactResult(...a),
}));

const rememberArtifact = vi.fn(async () => {});
vi.mock('../createTurnHelpers.js', () => ({
  rememberArtifact: (...a: unknown[]) => rememberArtifact(...a),
}));

const {
  generateAndCreateDocument,
  handleBoardCreation,
  handlePdfCreation,
  handlePresentationCreation,
  handleSheetCreation,
} = await import('./artifactTurns.js');

const baseOpts = {
  sse: { send: vi.fn(), end: vi.fn() },
  classifiedState: { messages: [], creationTopic: null } as unknown as ChatGraphState,
  aiClient: {} as ChatGraphState['aiClient'],
  req: {} as Express.Request,
  userId: 'u1',
  userContent: 'Thema',
};

beforeEach(() => {
  runCreateTurn.mockClear();
  emitArtifactResult.mockClear();
  rememberArtifact.mockClear();
  generateDoc.mockReset();
  makeDocumentSpec.mockClear();
});

describe('artifact turn dispatch', () => {
  it.each([
    ['sheet', () => handleSheetCreation(baseOpts as never), SHEET_SPEC],
    ['presentation', () => handlePresentationCreation(baseOpts as never), PRESENTATION_SPEC],
    ['pdf', () => handlePdfCreation({ ...baseOpts, userLocale: 'de-DE' } as never), PDF_SPEC],
  ])('%s creation runs the turn with its own spec', async (_name, run, spec) => {
    await run();
    expect(runCreateTurn).toHaveBeenCalledTimes(1);
    expect(runCreateTurn.mock.calls[0][0]).toBe(spec);
  });

  /**
   * The board branch predates the router-side topic resolution and still gets
   * the raw message, so it resolves the subject itself — the classifier's
   * `creationTopic` first, the referential heuristic only as fallback.
   */
  it('board creation prefers the classifier topic over the raw message', async () => {
    await handleBoardCreation({
      ...baseOpts,
      classifiedState: {
        messages: [],
        creationTopic: 'Wahlkampfplan',
      } as unknown as ChatGraphState,
      lastUserMessage: { role: 'user', content: 'mach ein Board davon' },
    } as never);

    expect(runCreateTurn.mock.calls[0][0]).toBe(BOARD_SPEC);
    expect((runCreateTurn.mock.calls[0][1] as { userContent: string }).userContent).toBe(
      'Wahlkampfplan'
    );
  });

  it('board creation falls back to the raw message when no topic was resolved', async () => {
    await handleBoardCreation({
      ...baseOpts,
      lastUserMessage: { role: 'user', content: 'Board zum Thema Verkehrswende' },
    } as never);

    expect((runCreateTurn.mock.calls[0][1] as { userContent: string }).userContent).toContain(
      'Verkehrswende'
    );
  });
});

describe('generateAndCreateDocument — the two modes', () => {
  it('owns the turn by default', async () => {
    const handled = await generateAndCreateDocument({ ...baseOpts, intent: 'create_doc' } as never);

    expect(handled).toBe(true);
    expect(runCreateTurn).toHaveBeenCalledTimes(1);
    expect(generateDoc).not.toHaveBeenCalled();
  });

  /**
   * save_as_doc writes into a stream its caller already opened and will close:
   * card and text, then stop. No `done`, no persisted message — and the
   * artifact is remembered by hand, because this path never reaches
   * persistAssistantResponse's deriveToolContext.
   */
  it('contributes to an open turn under skipTerminate, without running the turn', async () => {
    generateDoc.mockResolvedValue({ documentId: 'd1', title: 'Notiz' });

    const handled = await generateAndCreateDocument({
      ...baseOpts,
      intent: 'save_as_doc',
      skipTerminate: true,
      actualThreadId: 't1',
    } as never);

    expect(handled).toBe(true);
    expect(runCreateTurn).not.toHaveBeenCalled();
    expect(emitArtifactResult).toHaveBeenCalledTimes(1);
    expect(rememberArtifact).toHaveBeenCalledWith('t1', 'document', 'd1', 'Notiz');
  });

  it('returns false instead of owning the failure when the contribution fails', async () => {
    generateDoc.mockRejectedValue(new Error('kaputt'));

    const handled = await generateAndCreateDocument({
      ...baseOpts,
      intent: 'save_as_doc',
      skipTerminate: true,
    } as never);

    expect(handled).toBe(false);
    expect(emitArtifactResult).not.toHaveBeenCalled();
  });
});
