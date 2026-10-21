/**
 * Eine Frage ÜBER den eingefügten Text („Welche vier Maßnahmen stehen im
 * Antrag?") — durch den echten Klassifikator, Router und Loop-Katalog.
 *
 * #4789: die Heuristik liest „im Antrag" als Parteiposition (`search`), die
 * Demotion schiebt den Turn in den Loop, und `demoted_retrieval` zwang den
 * Planer zu einer Suche nach dem, was im Prompt stand. Die Treffer landeten
 * als 10–20 fremde Quellen unter der Antwort und in den Folge-Turns.
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
// Wie im Harness, nur mit einer Thread-Anhangzeile: so trägt der Server einen
// Paste-Chip aus einem früheren Turn weiter (`FRÜHERE DOKUMENTE`).
const threadRows = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock('../services/attachmentPersistenceService.js', async (orig) => {
  const { attachmentPersistenceMock } = await import('./harness/mocks.js');
  return {
    ...attachmentPersistenceMock((await orig()) as Record<string, unknown>),
    getThreadAttachments: () => Promise.resolve(threadRows.rows),
  };
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

const { startChatApp, userTurn } = await import('./harness/testApp.js');
const { runTurn, installNetworkGuard } = await import('./harness/trace.js');
const { createProviderStub } = await import('./harness/providerStub.js');
const { createJournalCapture } = await import('./harness/journalCapture.js');
const { pinChatEnv } = await import('./harness/env.js');
const { resetThreadStore } = await import('./harness/fakeThreadStore.js');
const { resetMockControls } = await import('./harness/mocks.js');
const { respond } = await import('./harness/respondScript.js');
const { loopScript } = await import('./harness/loopScript.js');
const { searchBackend } = await import('./harness/searchBackendStub.js');

const ANTRAG = [
  'Antrag an die Stadtverordnetenversammlung: Sichere Schulwege für alle Kinder',
  'Die Stadtverordnetenversammlung möge beschließen:',
  '1. Vor allen Grundschulen wird Tempo 30 ganztägig angeordnet.',
  '2. An den zwölf gefährlichsten Querungen werden bis Ende 2027 Zebrastreifen mit Mittelinseln gebaut.',
  '3. Die Stadt richtet Elternhaltestellen mindestens 250 Meter vor den Schultoren ein.',
  '4. Jede Grundschule erhält einen Schulwegplan, der mit Eltern, Polizei und Schüler*innen erarbeitet wird.',
  'Begründung: Im vergangenen Jahr verunglückten in unserer Stadt 41 Kinder auf dem Schulweg. Die Kosten für die Maßnahmen belaufen sich laut Bauamt auf rund 1,2 Millionen Euro, verteilt auf zwei Haushaltsjahre. Fördermittel des Landes aus dem Programm „Nahmobilität“ decken davon bis zu 60 Prozent.',
  'Auch die Klimaziele der Stadt profitieren: wer sicher zu Fuß oder mit dem Rad zur Schule kommt, braucht kein Elterntaxi. Der Antrag ergänzt den Radverkehrsplan und das Mobilitätskonzept 2030.',
].join('\n\n');

function pasteAttachment(text: string): Record<string, unknown> {
  return {
    name: 'Eingefügter Text.txt',
    type: 'text/plain',
    size: text.length,
    isImage: false,
    data: Buffer.from(text, 'utf8').toString('base64'),
  };
}

const QUESTIONS = [
  'Welche vier Maßnahmen stehen im Antrag genau?',
  'Wie hoch waren nochmal die Kosten laut Antrag?',
];

const ANSWER = { text: 'Im Antrag stehen vier Maßnahmen.' };

const pool = createProviderStub();
const capture = createJournalCapture();
let app: Awaited<ReturnType<typeof startChatApp>>;
let restoreNetwork: () => void;

beforeAll(async () => {
  restoreNetwork = installNetworkGuard();
  app = await startChatApp({ decisionJournal: capture.middleware });
  pinChatEnv();
  await runTurn(app.baseUrl, { messages: [userTurn('Hallo!')] });
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
  pool.reset();
  capture.reset();
  loopScript.reset();
  searchBackend.reset();
  threadRows.rows = [];
});

/** Der erste Planer-Schritt: kein Zwang, oder der Turn lief gar nicht im Loop. */
function firstStepChoice(): unknown {
  return loopScript.calls[0]?.toolChoice ?? 'no-loop';
}

describe('a question about pasted material forces no lookup (#4789)', () => {
  it.each(QUESTIONS)('chip in the same turn: %s', async (q) => {
    loopScript.script(ANSWER, ANSWER);
    await runTurn(app.baseUrl, {
      messages: [userTurn(q)],
      attachments: [pasteAttachment(ANTRAG)],
    });
    expect(firstStepChoice()).not.toBe('required');
  });

  it.each(QUESTIONS)('chip in an earlier turn (thread attachment): %s', async (q) => {
    threadRows.rows = [
      {
        id: 'att-1',
        name: 'Eingefügter Text.txt',
        mimeType: 'text/plain',
        isImage: false,
        extractedText: ANTRAG,
        documentId: null,
        summary: null,
        hasFileData: false,
      },
    ];
    loopScript.script(ANSWER, ANSWER);
    await runTurn(app.baseUrl, {
      messages: [
        userTurn('Schreib mir einen Facebook-Post dazu', 'm1'),
        { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hier ist der Post.' }] },
        userTurn(q, 'm2'),
      ],
    });
    expect(firstStepChoice()).not.toBe('required');
  });

  it.each(QUESTIONS)('promoted paste in an earlier turn: %s', async (q) => {
    loopScript.script(ANSWER, ANSWER);
    await runTurn(app.baseUrl, {
      messages: [
        userTurn(ANTRAG, 'm1'),
        {
          id: 'a1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Danke, was soll ich damit tun?' }],
        },
        userTurn(q, 'm2'),
      ],
    });
    expect(firstStepChoice()).not.toBe('required');
  });

  // Gegenprobe: der Stoff im Thread entwaffnet keine fremde Faktenfrage.
  it('a fact question that does not point at the paste still looks it up', async () => {
    loopScript.script(ANSWER, ANSWER);
    await runTurn(app.baseUrl, {
      messages: [
        userTurn(ANTRAG, 'm1'),
        {
          id: 'a1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Danke, was soll ich damit tun?' }],
        },
        userTurn('wer ist aktuell Bundeskanzler in Österreich', 'm2'),
      ],
    });
    expect(firstStepChoice()).toBe('required');
  });
});
