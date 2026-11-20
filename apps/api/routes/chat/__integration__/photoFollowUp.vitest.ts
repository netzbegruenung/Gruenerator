/**
 * Das „Ja" auf eine Rückfrage zu einem Foto aus einem früheren Zug — durch den
 * echten Klassifikator, Router und Loop-Katalog, das Modell geskriptet.
 *
 * Live 20.11.2026: Foto + „erstelle bitte aus diesem bild ein winterliches
 * bild …" → „Soll ich?" → „Ja" → „Ich versuche es sofort noch einmal", ohne
 * Werkzeug. Das Foto überlebte seinen Zug nicht: gespeichert wurde nur eine
 * Beschreibung, `edit_image` hatte nichts zu bearbeiten (#5879). Seitdem liegen
 * die Bytes in `file_data`, und `listTurnImageRefs` führt sie als frühere
 * Fotos des Threads — aus dem Thread, nicht aus dem Request, also auch nach
 * dem Neuladen und Tage später.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/ai/execution/index.js', async () => {
  const { executeProviderStub } = await import('./harness/providerStub.js');
  return { executeProvider: executeProviderStub };
});

// Like loopRun, except Postgres answers the social-post lookup with no rows: a
// fresh thread has no post, and the harness default (throw) turned
// „übersetze das" into a failed social-post edit that production never takes.
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
vi.mock('../services/postResponseService.js', async (orig) => {
  const { postResponseMock } = await import('./harness/mocks.js');
  return postResponseMock((await orig()) as Record<string, unknown>);
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
// Only the retrieval BACKEND — the tool definitions, `wrapTools` and every guard
// stay real. Without this each search errors out, `noteFailure` fires, and the
// failure caps (2 per tool, 5 overall) trip before the search budget (6 calls)
// ever can: four of the six guard branches would be unreachable and the other
// two would fire for the wrong reason.
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
vi.mock('../agents/notebookCollectionSearch.js', async () => {
  const stub = await import('./harness/searchBackendStub.js');
  return { searchCollectionAsNotebook: stub.fakeExecuteDirectSearch };
});
// NOT mocked here, unlike every sibling file: agenticRespondService. Doubling it
// is exactly what puts the loop out of reach.
//
// `ai` is replaced instead. `loopEngine` imports streamText/generateText at
// module scope into `defaultDeps`, and `runAgenticLoop(p, deps = defaultDeps)`
// reads them from there — so this reaches the loop without threading anything
// through the router. Partial spread: `tool`, `isStepCount`,
// `convertToModelMessages` and the rest must stay real.
// Der Bundestag-/Abgeordnetenwatch-Abruf, aus demselben Grund wie
// `directSearch` oben: nur das BACKEND wird ersetzt. Die Werkzeugdefinition, das
// Locale-Gitter am Katalog und der `searchNode`-Zweig bleiben echt — sonst
// prueft der Flip-Test eine erfundene Welt statt der Montage, um die es geht.
vi.mock('../../../services/bundestag/BundestagEnrichedService.js', async (orig) => {
  const { fakeBundestagService } = await import('./harness/searchBackendStub.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    getBundestagEnrichedService: fakeBundestagService,
  };
});
// PolitPro hinter dem `umfragen`-Werkzeug, aus demselben Grund. Es ist der
// Werkzeug-Pin, den `mention-umfragen-loop` prueft: der Intent dahinter ist
// stillgelegt, die Montage im Katalog bleibt echt.
vi.mock('../../../services/monitor/UmfragenService.js', async (orig) => {
  const { fakeLookupUmfragen } = await import('./harness/searchBackendStub.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    lookupUmfragen: fakeLookupUmfragen,
  };
});

// Der Dokument-Abruf hinter Seed, `dokumente_lesen` und `summarize` — dieselbe
// Begründung wie beim DIP und bei PolitPro: nur das Backend, nicht die Kette.
vi.mock('../../../services/document-services/DocumentSearchService/index.js', async (orig) => {
  const { fakeQdrantDocumentService } = await import('./harness/searchBackendStub.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    getQdrantDocumentService: fakeQdrantDocumentService,
  };
});

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

// Das Bild selbst: FLUX und die Datei auf der Platte sind nicht der Gegenstand.
vi.mock('../services/lastGeneratedImage.js', () => ({
  loadLastGeneratedImage: async () => ({ name: 'vorher.jpg', type: 'image/jpeg', data: 'AAAA' }),
}));
const editInputs: Array<{ name: string; data: string }> = [];
vi.mock('../../../agents/langgraph/ChatGraph/nodes/imageEditNode.js', () => ({
  imageEditNode: async (state: { imageAttachments?: Array<{ name: string; data: string }> }) => {
    editInputs.push(...(state.imageAttachments ?? []));
    return {
      generatedImage: {
        base64: '',
        url: '/uploads/flux/results/t/winter.jpg',
        filename: 'winter.jpg',
        prompt: 'winterlich',
        style: 'illustration',
        generationTimeMs: 1,
      },
      imagePrompt: 'winterlich',
    };
  },
}));

const { startChatApp, userTurn } = await import('./harness/testApp.js');
const { runTurn, installNetworkGuard } = await import('./harness/trace.js');
const { createJournalCapture } = await import('./harness/journalCapture.js');
const { pinChatEnv } = await import('./harness/env.js');
const { createThread, resetThreadStore } = await import('./harness/fakeThreadStore.js');
const { TEST_USER } = await import('./harness/fakeUser.js');
const { resetMockControls, attachmentControl } = await import('./harness/mocks.js');
const { respond } = await import('./harness/respondScript.js');
const { loopScript } = await import('./harness/loopScript.js');
const { searchBackend } = await import('./harness/searchBackendStub.js');

const OFFER =
  'Ich kann aus dem Foto ein winterliches Bild mit Menschen beim Glühweintrinken erstellen. Soll ich?';

let app: Awaited<ReturnType<typeof startChatApp>>;
let restoreNetwork: () => void;

beforeAll(async () => {
  restoreNetwork = installNetworkGuard();
  app = await startChatApp({ decisionJournal: createJournalCapture().middleware });
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
  respond.reset();
  loopScript.reset();
  searchBackend.reset();
  editInputs.length = 0;
});

/** Ein Thread, in dessen erstem Zug ein Foto hochgeladen wurde. `stored`: die
 *  Bytes liegen in `file_data` (ab 20.11.2026), sonst nur die Beschreibung. */
async function photoThread(stored: boolean): Promise<string> {
  const thread = await createThread(TEST_USER.id, 'gruenerator-universal', 'Foto-Thread');
  attachmentControl.threadAttachments = [
    {
      id: 'att-weiher',
      name: 'weiher.jpg',
      mimeType: 'image/jpeg',
      isImage: true,
      extractedText: null,
      documentId: null,
      summary: 'Ein Platz mit Weiher und Bäumen.',
      hasFileData: stored,
      createdAt: new Date(),
    },
  ];
  if (stored) {
    attachmentControl.imageData.set('att-weiher', {
      name: 'weiher.jpg',
      mimeType: 'image/jpeg',
      data: 'V0VJSEVS',
    });
  }
  return thread.id;
}

/** „Ja" auf die Rückfrage — ohne Anhang in diesem Zug, wie nach dem Neuladen. */
function acceptTurn(threadId: string) {
  return runTurn(app.baseUrl, {
    threadId,
    messages: [
      userTurn('erstelle bitte aus diesem bild ein winterliches bild', 'm1'),
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: OFFER }] },
      userTurn('Ja', 'm2'),
    ],
  });
}

describe('„Ja" auf die Rückfrage zu einem früher hochgeladenen Foto (#5879)', () => {
  it('bietet das gespeicherte Foto als Bild 1 an und bearbeitet genau dieses', async () => {
    const threadId = await photoThread(true);
    loopScript.script({
      calls: [{ tool: 'edit_image', args: { anweisung: 'winterlich, Glühwein', bild: 1 } }],
      text: 'Hier ist die winterliche Version.',
    });
    const { events } = await acceptTurn(threadId);

    expect(loopScript.calls[0]?.toolNames).toContain('edit_image');
    expect(loopScript.calls[0]?.toolNames).toContain('bild_ansehen');
    // Die Bytes aus dem Thread, nicht ein zuletzt erzeugtes Bild.
    expect(editInputs).toEqual([{ name: 'weiher.jpg', type: 'image/jpeg', data: 'V0VJSEVS' }]);
    const done = events.find((e) => e.event === 'image_complete');
    expect((done?.data as { image?: { url?: string } } | undefined)?.image?.url).toBe(
      '/uploads/flux/results/t/winter.jpg'
    );
  });

  it('nennt das Foto im Systemprompt als frühere Nachricht', async () => {
    const threadId = await photoThread(true);
    loopScript.script({ text: 'Antwort.' });
    await acceptTurn(threadId);
    expect(loopScript.calls[0]?.system ?? '').toContain(
      'Bild 1: weiher.jpg (aus einer früheren Nachricht)'
    );
  });

  it('ohne gespeicherte Bytes (Foto von vor dem Fix) bleibt die Liste leer', async () => {
    const threadId = await photoThread(false);
    loopScript.script({ text: 'Antwort.' });
    await acceptTurn(threadId);
    expect(loopScript.calls[0]?.toolNames).not.toContain('edit_image');
    expect(loopScript.calls[0]?.toolNames).not.toContain('bild_ansehen');
  });
});
