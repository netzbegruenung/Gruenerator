/**
 * A pure artefact order through the REAL loop — classifier, router, catalog
 * and `agenticRespondService` — with the model scripted (#5456).
 *
 * The order no longer goes to its single-pass dispatcher: the loop runs the fat tool BEFORE the answer, with
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
// The sheet edit itself (write access, Yjs state, the planner) is not under
// test: the follow-up turn must REACH it, with the sheet the pointer names.
const sheetEdits = vi.hoisted(() => [] as Array<{ sheetId: string; instruction: string }>);
vi.mock('../services/sheetEditCore.js', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  planAndQueueSheetEdit: async (opts: { sheetId: string; instruction: string }) => {
    sheetEdits.push({ sheetId: opts.sheetId, instruction: opts.instruction });
    return {
      status: 'queued',
      title: 'Tabelle',
      summary: '1 Spalte',
      live: true,
      operationCount: 1,
    };
  },
}));
// The sharepic generator (creator, review, photo catalog) is not under test:
// the order must REACH it, once, before the answer.
const sharepicCalls = vi.hoisted(() => [] as Array<{ text: string }>);
vi.mock('../services/intentHandlers/sharepic.js', async (orig) => {
  const original = (await orig()) as typeof import('../services/intentHandlers/sharepic.js');
  return {
    ...original,
    runSharepicGeneration: async (opts: Parameters<typeof original.runSharepicGeneration>[0]) => {
      sharepicCalls.push({ text: String((opts as { text?: unknown }).text ?? '') });
      const variants = [
        {
          id: 'v1',
          canvasType: 'dreizeilen',
          initialProps: { line1: 'Mehr', line2: 'Radwege', line3: 'jetzt' },
        },
      ] as never[];
      opts.sse.send('sharepic_complete', { message: 'stub', variants });
      return { variants, failure: null } as never;
    },
  };
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
const {
  resetThreadStore,
  messagesOf,
  threads,
  createThread,
  createMessage,
  createPendingAssistantMessage,
  finalizeAssistantMessage,
} = await import('./harness/fakeThreadStore.js');
const { TEST_USER } = await import('./harness/fakeUser.js');
const { resetMockControls } = await import('./harness/mocks.js');
const { respond } = await import('./harness/respondScript.js');
const { loopScript } = await import('./harness/loopScript.js');
const { searchBackend } = await import('./harness/searchBackendStub.js');
const { generatorControl, resetGeneratorControl } =
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
  sheetEdits.length = 0;
  sharepicCalls.length = 0;
});

/**
 * One row per kind with a document card. `edit` is the tool a vague
 * follow-up must reach, `again` a second order in the same thread.
 */
const KINDS = [
  {
    kind: 'sheet',
    tool: 'create_sheet',
    generator: 'doc',
    order: 'Erstelle eine Tabelle zu Solarenergie',
    followUp: 'Füg eine Spalte für die Kosten hinzu',
    edit: ['edit_sheet'],
    again: 'Erstelle eine neue Tabelle zu Windkraft',
  },
  {
    kind: 'presentation',
    tool: 'create_presentation',
    generator: 'doc',
    order: 'Erstelle eine Präsentation zur Verkehrswende',
    followUp: 'Mach die Folien kürzer',
    edit: ['edit_presentation'],
    again: 'Erstelle eine neue Präsentation zur Windkraft',
  },
  {
    kind: 'explainable',
    tool: 'create_explainable',
    generator: 'explainable',
    order: 'Erstelle ein Explainable zur Schwammstadt',
    followUp: 'Erklär das noch einfacher',
    edit: ['edit_explainable'],
    again: 'Erstelle ein neues Explainable zur Windkraft',
  },
  {
    kind: 'document',
    tool: 'create_document',
    generator: 'doc',
    order: 'Erstelle ein Dokument: Antrag für mehr Radwege',
    followUp: 'mach das förmlicher',
    edit: ['edit_document_text', 'edit_document'],
    again: 'Erstelle ein neues Dokument: Antrag für mehr Bänke',
  },
] as const;

const ANSWER = 'Fertig, schau es dir an.';

/** One assistant reply as the client sends it back with the next turn. */
const assistantTurn = (id: string, text: string) => ({
  id,
  role: 'assistant',
  parts: [{ type: 'text', text }],
});

describe.each(KINDS)('a pure $kind order runs in the loop', (k) => {
  it('builds the artefact before the answer and lets the model write it', async () => {
    loopScript.script({ text: ANSWER });
    const { trace, events } = await runTurn(app.baseUrl, { messages: [userTurn(k.order)] });

    assertEventOrder(events);
    expect(trace.agentic).toBe(true);
    // Exactly one generation, briefed with the order, and no model step for it.
    expect(generatorControl.calls).toHaveLength(1);
    expect(generatorControl.calls[0]?.generator).toBe(k.generator);
    expect(generatorControl.calls[0]?.userContent).toContain(k.order);
    expect(loopScript.calls).toHaveLength(1);
    loopScript.assertScriptsConsumed();
    // The one model call sees the result and may not call a tool again, and
    // is told the artefact is done — not that it ran out of steps.
    expect(loopScript.calls[0]?.messagesJson).toContain(k.tool);
    expect(loopScript.calls[0]?.toolChoice).toBe('none');
    expect(loopScript.calls[0]?.system).toContain('Das Artefakt dieses Turns ist erstellt');
    expect(loopScript.calls[0]?.system).not.toContain('Schritt-Limit');
    // The card, the tool step and the model's own sentence.
    expect(trace.documentCreated).toBe(true);
    expect(trace.toolCalls.map((c) => c.toolName)).toContain(k.tool);
    expect(trace.fullText).toContain(ANSWER);
  });

  it('persists the card and points the thread at the artefact', async () => {
    loopScript.script({ text: ANSWER });
    const { trace } = await runTurn(app.baseUrl, { messages: [userTurn(k.order)] });

    const threadId = trace.threadId as string;
    const assistant = messagesOf(threadId)
      .filter((m) => m.role === 'assistant')
      .at(-1);
    expect(assistant?.metadata).toMatchObject({ createdDocument: {} });
    expect(threads.get(threadId)?.lastToolContext).toMatchObject({ kind: k.kind });
  });

  it('order → vague follow-up edits it → a second order builds a new one', async () => {
    loopScript.script({ text: ANSWER });
    const first = await runTurn(app.baseUrl, { messages: [userTurn(k.order, 'm0')] });
    const threadId = first.trace.threadId as string;
    expect(generatorControl.calls).toHaveLength(1);
    expect(threads.get(threadId)?.lastToolContext).toMatchObject({ kind: k.kind });

    // A vague follow-up: the pointer routes it to THIS artefact (single-pass
    // edit or the loop with the edit tool on offer), and nothing new is built.
    loopScript.script({ text: 'Geändert.' });
    const second = await runTurn(app.baseUrl, {
      threadId,
      messages: [userTurn(k.order, 'm0'), assistantTurn('a0', ANSWER), userTurn(k.followUp, 'm1')],
    });
    const offered = loopScript.calls.at(-1)?.toolNames ?? [];
    const editsIt =
      k.edit.some((t) => offered.includes(t)) ||
      (second.trace.intent ?? '').startsWith('edit_') ||
      sheetEdits.length > 0;
    expect(editsIt, `follow-up intent=${second.trace.intent} tools=${offered.join(',')}`).toBe(
      true
    );
    expect(generatorControl.calls).toHaveLength(1);

    loopScript.script({ text: 'Das zweite steht.' });
    const third = await runTurn(app.baseUrl, {
      threadId,
      messages: [
        userTurn(k.order, 'm0'),
        assistantTurn('a0', ANSWER),
        userTurn(k.followUp, 'm1'),
        assistantTurn('a1', 'Geändert.'),
        userTurn(k.again, 'm2'),
      ],
    });
    expect(generatorControl.calls).toHaveLength(2);
    expect(third.trace.documentCreated).toBe(true);
  });
});

describe('a pure PDF order runs in the loop', () => {
  it("builds the PDF before the answer, with the self-check in the model's view", async () => {
    loopScript.script({ text: ANSWER });
    const { trace } = await runTurn(app.baseUrl, {
      messages: [userTurn('Erstelle ein PDF mit unseren Forderungen zur Kitafinanzierung')],
    });

    expect(generatorControl.calls).toHaveLength(1);
    expect(generatorControl.calls[0]?.generator).toBe('pdf');
    expect(loopScript.calls).toHaveLength(1);
    expect(loopScript.calls[0]?.toolChoice).toBe('none');
    expect(loopScript.calls[0]?.messagesJson).toContain('geprueft');
    expect(trace.documentCreated).toBe(true);
    expect(threads.get(trace.threadId as string)?.lastToolContext).toMatchObject({ kind: 'pdf' });
  });

  it('turns „Ändere das PDF: …" in the next turn into an edit of the stored PDF', async () => {
    const order = 'Erstelle ein PDF mit unseren Forderungen zur Kitafinanzierung';
    loopScript.script({ text: ANSWER });
    const first = await runTurn(app.baseUrl, { messages: [userTurn(order, 'm0')] });

    loopScript.script({ text: 'Angepasst.' });
    const second = await runTurn(app.baseUrl, {
      threadId: first.trace.threadId as string,
      messages: [
        userTurn(order, 'm0'),
        assistantTurn('a0', ANSWER),
        userTurn('Ändere das PDF: Titel kürzer', 'm1'),
      ],
    });

    const call = second.trace.toolCalls.find((c) => c.toolName === 'create_pdf');
    expect(
      call?.args,
      `intent=${second.trace.intent} tools=${loopScript.calls.at(-1)?.toolNames.join(',')}`
    ).toMatchObject({
      aendert_letztes_pdf: true,
    });
  });
});

describe('a pure board order runs in the loop', () => {
  it('builds the board before the answer and points the thread at it', async () => {
    loopScript.script({ text: ANSWER });
    const { trace, events } = await runTurn(app.baseUrl, {
      messages: [userTurn('Erstelle ein Board für den Wahlkampf')],
    });

    assertEventOrder(events);
    expect(generatorControl.calls).toHaveLength(1);
    expect(generatorControl.calls[0]?.generator).toBe('board');
    expect(loopScript.calls).toHaveLength(1);
    expect(loopScript.calls[0]?.toolChoice).toBe('none');
    // Boards have no card: the client seeds the board from `done`.
    const done = events.find((e) => e.event === 'done');
    expect(done?.data.boardId).toBeTruthy();
    expect(trace.fullText).toContain(ANSWER);
    expect(threads.get(trace.threadId as string)?.lastToolContext).toMatchObject({
      kind: 'board',
    });
  });

  it('routes a vague follow-up to the board it built', async () => {
    const order = 'Erstelle ein Board für den Wahlkampf';
    loopScript.script({ text: ANSWER });
    const first = await runTurn(app.baseUrl, { messages: [userTurn(order, 'm0')] });

    loopScript.script({ text: 'Aufgabe ergänzt.' });
    await runTurn(app.baseUrl, {
      threadId: first.trace.threadId as string,
      messages: [
        userTurn(order, 'm0'),
        assistantTurn('a0', ANSWER),
        userTurn('noch eine Aufgabe: Plakate bestellen', 'm1'),
      ],
    });
    expect(loopScript.calls.at(-1)?.toolNames ?? []).toContain('boards_tasks');
    expect(generatorControl.calls).toHaveLength(1);
  });
});

describe('a pure sharepic order runs in the loop', () => {
  it('builds the sharepic before the answer and lets the model write it', async () => {
    loopScript.script({ text: ANSWER });
    const { trace } = await runTurn(app.baseUrl, {
      messages: [userTurn('Mach ein Sharepic: Mehr Radwege jetzt')],
    });

    expect(trace.agentic).toBe(true);
    expect(sharepicCalls).toHaveLength(1);
    expect(loopScript.calls).toHaveLength(1);
    expect(loopScript.calls[0]?.toolChoice).toBe('none');
    expect(trace.toolCalls.map((c) => c.toolName)).toContain('sharepic');
    expect(trace.fullText).toContain(ANSWER);
    expect(threads.get(trace.threadId as string)?.lastToolContext).toMatchObject({
      kind: 'sharepic',
    });
  });
});

describe('„ja" on an artefact offer runs in the loop', () => {
  const SPEECH =
    'Liebe Freund*innen, die Verkehrswende beginnt vor unserer Haustür: sichere Radwege, ein Bus im Takt und ein Klimaticket, das sich alle leisten können.';
  const offerAnswer = `${SPEECH}\n\nSoll ich daraus eine Präsentation machen?`;

  it('builds the offered kind from the previous answer, and the model writes', async () => {
    const thread = await createThread(TEST_USER.id, 'gruenerator-universal', 'Angebot');
    await createMessage(thread.id, 'user', 'Schreib mir eine kurze Rede zur Verkehrswende');
    const assistantId = await createPendingAssistantMessage(thread.id);
    await finalizeAssistantMessage(assistantId, offerAnswer, {
      intent: 'produktion',
      offer: { kind: 'presentation' },
    });

    loopScript.script({ text: ANSWER });
    const { trace } = await runTurn(app.baseUrl, {
      threadId: thread.id,
      messages: [
        userTurn('Schreib mir eine kurze Rede zur Verkehrswende', 'm0'),
        assistantTurn('a0', offerAnswer),
        userTurn('ja gern', 'm1'),
      ],
    });

    expect(trace.agentic).toBe(true);
    expect(generatorControl.calls).toHaveLength(1);
    expect(generatorControl.calls[0]?.kind).toBe('presentation');
    expect(generatorControl.calls[0]?.userContent).toContain('sichere Radwege');
    expect(loopScript.calls[0]?.toolChoice).toBe('none');
    expect(trace.documentCreated).toBe(true);
    expect(trace.fullText).toContain(ANSWER);
  });
});

describe('the edges of the pure order', () => {
  it('hands a failed generation to the model instead of claiming a sheet', async () => {
    generatorControl.docOk = false;
    const honest = 'Die Tabelle ließ sich gerade nicht erstellen.';
    loopScript.script({ text: honest });
    const { trace } = await runTurn(app.baseUrl, {
      messages: [userTurn('Erstelle eine Tabelle zu Solarenergie')],
    });

    expect(trace.documentCreated).toBe(false);
    expect(trace.artifactIds).toHaveLength(0);
    // The model saw the failed result, and the post-stream net did not retry.
    expect(loopScript.calls[0]?.messagesJson).toContain('error');
    expect(generatorControl.calls).toHaveLength(1);
    expect(trace.fullText).toContain(honest);
  });

  it('keeps a research+create order a compound turn (tool after the research)', async () => {
    loopScript.script({ text: ANSWER });
    await runTurn(app.baseUrl, {
      messages: [userTurn('Recherchiere die Zahlen und erstelle eine Tabelle dazu')],
    });
    expect(loopScript.calls[0]?.messagesJson).not.toContain('ordered-artifact');
  });
});

describe('@verlauf runs in the loop', () => {
  it.each([
    ['the mention', { forcedTools: ['chat_history'] }, 'Was steht zum Radweg drin?'],
    ['the classified intent', {}, 'Was haben wir letzte Woche zum Radweg besprochen?'],
  ])('%s forces search_threads as the first call', async (_name, extra, prompt) => {
    loopScript.script({ text: ANSWER });
    const { trace } = await runTurn(app.baseUrl, { messages: [userTurn(prompt)], ...extra });

    expect(trace.agentic, `intent=${trace.intent}`).toBe(true);
    // Named (`@verlauf` pin) or required over exactly the history search.
    const first = loopScript.calls[0];
    const forcedName = (first?.toolChoice as { toolName?: string } | null)?.toolName ?? null;
    expect(
      forcedName === 'search_threads' ||
        (first?.toolChoice === 'required' &&
          JSON.stringify(first.firstStepActiveTools) === JSON.stringify(['search_threads'])),
      `toolChoice=${JSON.stringify(first?.toolChoice)} active=${JSON.stringify(first?.firstStepActiveTools)}`
    ).toBe(true);
  });
});
