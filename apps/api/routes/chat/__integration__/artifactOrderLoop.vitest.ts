/**
 * A pure artefact order through the REAL loop — classifier, router, catalog
 * and `agenticRespondService` — with the model scripted (#5456).
 *
 * For the kinds in `LOOP_ORDER_KINDS` the order no longer goes to its
 * single-pass dispatcher: the loop runs the fat tool BEFORE the answer, with
 * the order as the brief, and the model then writes the answer with the result
 * in view. This file pins that door, across several turns of one thread:
 * the order, a vague follow-up that must edit THAT artefact, and a second
 * order that must build a new one. The single-pass door stays pinned in
 * createTurns.vitest.ts (loop off).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/ai/execution/index.js', async () => {
  const { executeProviderStub } = await import('./harness/providerStub.js');
  return { executeProvider: executeProviderStub };
});
vi.mock('../services/artifactGeneration.js', async (orig) => {
  const { artifactGenerationStub } = await import('./harness/artifactGeneratorStub.js');
  return artifactGenerationStub((await orig()) as Record<string, unknown>);
});
vi.mock('../../../database/services/PostgresService.js', async () => ({
  getPostgresInstance: () => ({
    query: (sql: string) => {
      if (String(sql).includes('FROM chat_messages')) return Promise.resolve([]);
      throw new Error(`unexpected Postgres query: ${String(sql).slice(0, 300)}`);
    },
  }),
}));
vi.mock('../services/threadPersistenceService.js', async () => {
  return await import('./harness/fakeThreadStore.js');
});
vi.mock('../services/threadAccessService.js', async () => {
  const { threadAccessMock } = await import('./harness/mocks.js');
  return threadAccessMock();
});
vi.mock('../services/compactionService.js', async (orig) => {
  const { compactionMock } = await import('./harness/mocks.js');
  return compactionMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/attachmentPersistenceService.js', async (orig) => {
  const { attachmentPersistenceMock } = await import('./harness/mocks.js');
  return attachmentPersistenceMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/pastChatRecallService.js', async (orig) => {
  const { pastChatRecallMock } = await import('./harness/mocks.js');
  return pastChatRecallMock((await orig()) as Record<string, unknown>);
});
vi.mock('../../../services/user/textFormRepository.js', async (orig) => {
  const { textFormMock } = await import('./harness/mocks.js');
  return textFormMock((await orig()) as Record<string, unknown>);
});
vi.mock('../../../services/skills/internalPrompts.js', async (orig) => {
  const { internalPromptsMock } = await import('./harness/mocks.js');
  return internalPromptsMock((await orig()) as Record<string, unknown>);
});
vi.mock('../../../services/trees/index.js', async (orig) => {
  const { treeBudgetMock } = await import('./harness/mocks.js');
  return treeBudgetMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/pipelineStateStore.js', async () => {
  const { pipelineStateStoreMock } = await import('./harness/mocks.js');
  return pipelineStateStoreMock();
});
vi.mock('../services/sharepicEditService.js', async (orig) => {
  const { sharepicEditMock } = await import('./harness/mocks.js');
  return sharepicEditMock((await orig()) as Record<string, unknown>);
});
vi.mock('../agents/directSearch.js', async (orig) => {
  const stub = await import('./harness/searchBackendStub.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    executeDirectSearch: stub.fakeExecuteDirectSearch,
    executeDirectWebSearch: stub.fakeExecuteDirectWebSearch,
    executeDirectExamplesSearch: stub.fakeExecuteDirectExamplesSearch,
    executeDirectPressemitteilungExamples: stub.fakeExecuteDirectPressemitteilungExamples,
  };
});
vi.mock('../../../services/document-services/DocumentSearchService/index.js', async (orig) => {
  const { fakeQdrantDocumentService } = await import('./harness/searchBackendStub.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    getQdrantDocumentService: fakeQdrantDocumentService,
  };
});
// Wie pasteOrderRouting: `ai` statt agenticRespondService ersetzen, damit der
// echte Loop-Katalog montiert wird.
vi.mock('ai', async (orig) => {
  const { fakeLoopStreamText, fakeLoopGenerateText } = await import('./harness/loopScript.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    streamText: fakeLoopStreamText,
    generateText: fakeLoopGenerateText,
  };
});
vi.mock('../services/responseStreamingService.js', async (orig) => {
  const { fakeResolveModel, fakeStreamForResolution, fakeStreamWithFallback } =
    await import('./harness/respondScript.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    resolveModel: fakeResolveModel,
    streamForResolution: fakeStreamForResolution,
    streamWithFallback: fakeStreamWithFallback,
  };
});

const { startChatApp, userTurn } = await import('./harness/testApp.js');
const { runTurn, installNetworkGuard, assertEventOrder } = await import('./harness/trace.js');
const { pinChatEnv } = await import('./harness/env.js');
const { resetThreadStore, messagesOf, threads } = await import('./harness/fakeThreadStore.js');
const { resetMockControls } = await import('./harness/mocks.js');
const { respond } = await import('./harness/respondScript.js');
const { loopScript } = await import('./harness/loopScript.js');
const { searchBackend } = await import('./harness/searchBackendStub.js');
const { generatorControl, resetGeneratorControl, STUB_DOC_ID } =
  await import('./harness/artifactGeneratorStub.js');

let app: Awaited<ReturnType<typeof startChatApp>>;
let restoreNetwork: () => void;

beforeAll(async () => {
  restoreNetwork = installNetworkGuard();
  app = await startChatApp();
  pinChatEnv();
}, 60_000);

afterAll(async () => {
  await app.close();
  restoreNetwork();
});

beforeEach(() => {
  pinChatEnv();
  resetThreadStore();
  resetMockControls();
  resetGeneratorControl();
  respond.reset();
  loopScript.reset();
  searchBackend.reset();
});

const ORDER = 'Erstelle eine Tabelle zu Solarenergie';
const ANSWER = 'Die Tabelle zur Solarenergie steht, mit Spalten für Jahr und Leistung.';

/** One assistant reply as the client sends it back with the next turn. */
const assistantTurn = (id: string, text: string) => ({
  id,
  role: 'assistant',
  parts: [{ type: 'text', text }],
});

describe('a pure sheet order runs in the loop', () => {
  it('builds the sheet before the answer and lets the model write it', async () => {
    loopScript.script({ text: ANSWER });
    const { trace, events } = await runTurn(app.baseUrl, { messages: [userTurn(ORDER)] });

    assertEventOrder(events);
    expect(trace.agentic).toBe(true);
    // Exactly one generation, briefed with the order, and no model step for it.
    expect(generatorControl.calls).toHaveLength(1);
    expect(generatorControl.calls[0]?.kind).toBe('sheet');
    expect(generatorControl.calls[0]?.userContent).toContain(ORDER);
    expect(loopScript.calls).toHaveLength(1);
    loopScript.assertScriptsConsumed();
    // The one model call sees the result and may not call a tool again.
    expect(loopScript.calls[0]?.messagesJson).toContain('create_sheet');
    expect(loopScript.calls[0]?.messagesJson).toContain(STUB_DOC_ID);
    expect(loopScript.calls[0]?.toolChoice).toBe('none');
    // The card, the tool step and the model's own sentence.
    expect(trace.documentCreated).toBe(true);
    expect(trace.toolCalls.map((c) => c.toolName)).toContain('create_sheet');
    expect(trace.fullText).toContain(ANSWER);
  });

  it('persists the card and points the thread at the sheet', async () => {
    loopScript.script({ text: ANSWER });
    const { trace } = await runTurn(app.baseUrl, { messages: [userTurn(ORDER)] });

    const threadId = trace.threadId as string;
    const assistant = messagesOf(threadId)
      .filter((m) => m.role === 'assistant')
      .at(-1);
    expect(assistant?.metadata).toMatchObject({ createdDocument: { documentId: STUB_DOC_ID } });
    expect(threads.get(threadId)?.lastToolContext).toMatchObject({
      kind: 'sheet',
      ref: STUB_DOC_ID,
    });
  });

  it('hands a failed generation to the model instead of claiming a sheet', async () => {
    generatorControl.docOk = false;
    const honest = 'Die Tabelle ließ sich gerade nicht erstellen.';
    loopScript.script({ text: honest });
    const { trace } = await runTurn(app.baseUrl, { messages: [userTurn(ORDER)] });

    expect(trace.documentCreated).toBe(false);
    expect(trace.artifactIds).toHaveLength(0);
    // The model saw the failed result; no retry of the tool before it wrote.
    expect(loopScript.calls[0]?.messagesJson).toContain('error');
    expect(generatorControl.calls).toHaveLength(1);
    expect(trace.fullText).toContain(honest);
  });

  it('keeps a research+create order a compound turn (tool after the research)', async () => {
    loopScript.script({ text: ANSWER });
    await runTurn(app.baseUrl, {
      messages: [userTurn('Recherchiere die Zahlen und erstelle eine Tabelle dazu')],
    });
    // Nothing ran before the model: the named step comes after the research.
    expect(loopScript.calls[0]?.messagesJson).not.toContain('ordered-artifact');
  });
});

describe('a sheet order across several turns of one thread', () => {
  it('order → vague follow-up edits it → a second order builds a new one', async () => {
    // Turn 1: the order.
    loopScript.script({ text: ANSWER });
    const first = await runTurn(app.baseUrl, { messages: [userTurn(ORDER, 'm0')] });
    const threadId = first.trace.threadId as string;
    expect(generatorControl.calls).toHaveLength(1);
    expect(threads.get(threadId)?.lastToolContext).toMatchObject({ kind: 'sheet' });

    // Turn 2: a vague follow-up. The pointer routes it to the sheet: either the
    // single-pass sheet edit or the loop with the sheet's edit tool on offer —
    // and NO new artefact.
    loopScript.script({ text: 'Spalte ergänzt.' });
    const second = await runTurn(app.baseUrl, {
      threadId,
      messages: [
        userTurn(ORDER, 'm0'),
        assistantTurn('a0', ANSWER),
        userTurn('Füg eine Spalte für die Kosten hinzu', 'm1'),
      ],
    });
    const editsTheSheet =
      second.trace.intent === 'edit_sheet' ||
      (loopScript.calls.at(-1)?.toolNames ?? []).includes('edit_sheet');
    expect(editsTheSheet).toBe(true);
    expect(generatorControl.calls).toHaveLength(1);

    // Turn 3: a second order in the same thread builds a NEW sheet.
    loopScript.script({ text: 'Die zweite Tabelle steht.' });
    const third = await runTurn(app.baseUrl, {
      threadId,
      messages: [
        userTurn(ORDER, 'm0'),
        assistantTurn('a0', ANSWER),
        userTurn('Füg eine Spalte für die Kosten hinzu', 'm1'),
        assistantTurn('a1', 'Spalte ergänzt.'),
        userTurn('Erstelle eine neue Tabelle zu Windkraft', 'm2'),
      ],
    });
    expect(generatorControl.calls).toHaveLength(2);
    expect(generatorControl.calls[1]?.userContent).toContain('Windkraft');
    expect(third.trace.documentCreated).toBe(true);
  });
});
