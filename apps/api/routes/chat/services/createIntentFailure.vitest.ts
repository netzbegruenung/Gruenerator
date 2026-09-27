/**
 * The invariant: a create_* intent ends in an artifact OR in a templated error —
 * NEVER in a fall-through to the generic respond pipeline.
 *
 * Why this exists: a create_pdf turn whose structure failed to parse used to
 * return false, handing the turn to the responder. The responder has no artifact
 * tools, so it invented a workaround ("copy the content into the Office app and
 * use 'save as PDF'"). That prose was persisted, and the NEXT referential turn
 * ("erstelle als pdf") inherited it as its subject — the finished PDF contained
 * the invented instructions.
 *
 * Every generation service is mocked at its dynamic-import path, so these run
 * without Postgres or a provider: the model "returns garbage", the parser
 * rejects it, and we assert the SSE contract of the failure path.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMessage = vi.fn();
const touchThread = vi.fn();
const setThreadToolContext = vi.fn();
const finalizeAssistantMessage = vi.fn();

vi.mock('./threadPersistenceService.js', () => ({
  createMessage,
  touchThread,
  setThreadToolContext,
  finalizeAssistantMessage,
}));

// Parsers return null = "model produced no usable structure", the exact
// condition that used to trigger the fall-through.
// The *_TOOL_SCHEMA exports must be present: without them the dynamic import
// throws and the handler's catch would produce the same visible outcome for the
// wrong reason, making these tests pass vacuously.
const TOOL_SCHEMA = { type: 'object' };

vi.mock('../../../services/sheets/SheetGenerationService.js', () => ({
  SHEET_GENERATION_PROMPT: 'sheet',
  SHEET_TOOL_SCHEMA: TOOL_SCHEMA,
  parseSheetStructure: () => null,
  createSheetDocument: vi.fn(),
}));
vi.mock('../../../services/presentations/PresentationGenerationService.js', () => ({
  PRESENTATION_GENERATION_PROMPT: 'presentation',
  PRESENTATION_TOOL_SCHEMA: TOOL_SCHEMA,
  parsePresentationStructure: () => null,
  createPresentationDocument: vi.fn(),
}));
vi.mock('../../../services/pdf/PdfGenerationService.js', () => ({
  PDF_GENERATION_PROMPT: 'pdf',
  validatePdfStructure: () => ({ ok: false, error: 'blocks: Required' }),
  createPdfDocument: vi.fn(),
}));
vi.mock('../../../services/pdf/pdfDocument.js', () => ({
  PDF_DOCUMENT_TOOL_SCHEMA: TOOL_SCHEMA,
}));
vi.mock('../../../services/boards/BoardService.js', () => ({
  BOARD_GENERATION_PROMPT: 'board',
  BOARD_TOOL_SCHEMA: TOOL_SCHEMA,
  parseBoardStructure: () => null,
  createBoardDocument: vi.fn(),
  postProcessBoardStructure: vi.fn(),
}));
vi.mock('../../../services/docs/DocGenerationService.js', () => ({
  DOCUMENT_GENERATION_PROMPT: 'document',
  DOCUMENT_TOOL_SCHEMA: TOOL_SCHEMA,
  parseDocumentResponse: () => ({ title: 'Neues Dokument', subtype: 'blank', content: '' }),
  createDocumentWithContent: vi.fn(),
}));

const {
  handleSheetCreation,
  handlePresentationCreation,
  handlePdfCreation,
  handleBoardCreation,
  generateAndCreateDocument,
} = await import('./intentExecutionService.js');

interface RecordedEvent {
  event: string;
  data: unknown;
}

function makeSse(): { sse: never; events: RecordedEvent[] } {
  const events: RecordedEvent[] = [];
  const sse = {
    send: (event: string, data: unknown) => void events.push({ event, data }),
    sendRaw: (event: string, data: unknown) => void events.push({ event, data }),
    end: () => void events.push({ event: 'end', data: null }),
    setTextListener: () => {},
  };
  return { sse: sse as never, events };
}

const classifiedState = {
  startTime: Date.now(),
  classificationTimeMs: 5,
  messages: [],
} as never;

const req = {} as never;

const baseOpts = {
  classifiedState,
  req,
  actualThreadId: 'thread-1',
  userId: 'user-1',
};

const texts = (events: RecordedEvent[]): string =>
  events
    .filter((e) => e.event === 'text_delta')
    .map((e) => (e.data as { text: string }).text)
    .join('');

const countOf = (events: RecordedEvent[], event: string): number =>
  events.filter((e) => e.event === event).length;

beforeEach(() => {
  createMessage.mockReset().mockResolvedValue(undefined);
  touchThread.mockReset().mockResolvedValue(undefined);
  setThreadToolContext.mockReset().mockResolvedValue(undefined);
});

const cases = [
  {
    name: 'create_pdf',
    intent: 'create_pdf',
    run: (sse: never) =>
      handlePdfCreation({ ...baseOpts, sse, userContent: 'Fact Sheet', userLocale: 'de-DE' }),
  },
  {
    name: 'create_sheet',
    intent: 'create_sheet',
    run: (sse: never) => handleSheetCreation({ ...baseOpts, sse, userContent: 'Tabelle' }),
  },
  {
    name: 'create_presentation',
    intent: 'create_presentation',
    run: (sse: never) =>
      handlePresentationCreation({ ...baseOpts, sse, userContent: 'Präsentation' }),
  },
  {
    name: 'create_board',
    intent: 'create_board',
    run: (sse: never) => handleBoardCreation({ ...baseOpts, sse, lastUserMessage: undefined }),
  },
  {
    name: 'create_document',
    intent: 'save_as_doc',
    run: (sse: never) =>
      generateAndCreateDocument({
        ...baseOpts,
        sse,
        userContent: 'Dokument',
        intent: 'save_as_doc',
      }),
  },
];

describe.each(cases)('$name owns the turn when generation fails', ({ intent, run }) => {
  it('never falls through to the responder', async () => {
    const { sse, events } = makeSse();

    await expect(run(sse)).resolves.toBe(true);
    expect(countOf(events, 'end')).toBe(1);
  });

  it('opens the stream exactly once', async () => {
    const { sse, events } = makeSse();
    await run(sse);

    // A second response_start would double the visible response; zero would
    // leave a `done` on a stream the client never saw open.
    expect(countOf(events, 'response_start')).toBe(1);
  });

  it('reports a templated error and terminates with done', async () => {
    const { sse, events } = makeSse();
    await run(sse);

    expect(texts(events)).toMatch(/konnte .* nicht|nicht erstell|nicht erzeug/i);
    expect(countOf(events, 'done')).toBe(1);
    expect(
      (events.find((e) => e.event === 'done')?.data as { metadata: { intent: string } }).metadata
        .intent
    ).toBe(intent);
  });

  it('emits no artifact card', async () => {
    const { sse, events } = makeSse();
    await run(sse);

    expect(countOf(events, 'document_created')).toBe(0);
  });

  it('persists nothing — a stored failure message would poison the next referential turn', async () => {
    const { sse } = makeSse();
    await run(sse);

    // findPriorSubject() picks up any assistant message >=40 chars that is not a
    // creation confirmation. Persisting the error text would make it the subject
    // of the next "erstelle als pdf" — exactly the reported bug.
    expect(createMessage).not.toHaveBeenCalled();
  });

  it('never emits a manual-export workaround', async () => {
    const { sse, events } = makeSse();
    await run(sse);

    // The literal hallucination from the production trace.
    expect(texts(events)).not.toMatch(/doku\.gruenerator\.eu|Als PDF speichern|Office/i);
  });
});

describe('save_as_doc keeps its deliberate fall-through', () => {
  it('returns false without owning the stream when skipTerminate is set', async () => {
    const { sse, events } = makeSse();

    // save_as_doc shares the turn with its caller — it must NOT terminate.
    await expect(
      generateAndCreateDocument({
        ...baseOpts,
        sse,
        userContent: 'Dokument',
        intent: 'save_as_doc',
        skipTerminate: true,
      })
    ).resolves.toBe(false);

    expect(countOf(events, 'response_start')).toBe(0);
    expect(countOf(events, 'done')).toBe(0);
    expect(countOf(events, 'end')).toBe(0);
  });
});

describe('an empty parse never becomes a document', () => {
  it('does not create a document when the model returned no content', async () => {
    const { createDocumentWithContent } =
      await import('../../../services/docs/DocGenerationService.js');
    const { sse } = makeSse();

    await generateAndCreateDocument({
      ...baseOpts,
      sse,
      userContent: 'Dokument',
      intent: 'save_as_doc',
    });

    // Previously this created a blank {title:'Neues Dokument', content:''} doc
    // and reported success — a fake artifact is worse than an honest failure.
    expect(createDocumentWithContent).not.toHaveBeenCalled();
  });
});
