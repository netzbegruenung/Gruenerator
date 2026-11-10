/**
 * Folgeaufträge auf ein erzeugtes Bild — durch den echten Klassifikator, Router
 * und Loop-Katalog, das Modell geskriptet.
 *
 * Live 05.11.2026: nach einem KI-Bild antwortete der Chat zweimal „Ich habe die
 * Grafik angepasst", ohne dass ein Bildwerkzeug lief. „anpassen" und „noch
 * einmal" standen in keiner Bearbeitungs-Vokabel; der kurze Turn blieb als
 * „Folgeauftrag ≤ 12 Wörter" ohne Werkzeug, der lange kam in den Loop — der
 * kein Bildwerkzeug hatte. Seitdem montiert der Loop `edit_image`, solange das
 * letzte Artefakt ein Bild ist, und der Planer entscheidet statt einer Wortliste.
 *
 * Jeder Fall sagt, ob der Turn das Bild ändern KANN: über das Einzeldurchlauf-
 * `image_edit` (eindeutige Vokabel) oder über `edit_image` im Loop. Die
 * Gegenproben sagen, dass kein Turn ungefragt zur Bearbeitung GEZWUNGEN wird.
 *
 * `IMAGE_MATRIX_OUT=<datei>` schreibt die Tabelle vor den Zusicherungen — so
 * lässt sich dieselbe Matrix gegen einen älteren Stand fahren.
 */
import { writeFileSync } from 'node:fs';

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
vi.mock('../../../agents/langgraph/ChatGraph/nodes/imageEditNode.js', () => ({
  imageEditNode: async () => ({
    generatedImage: {
      base64: '',
      url: '/uploads/flux/results/t/nachher.jpg',
      filename: 'nachher.jpg',
      prompt: 'bearbeitet',
      style: 'illustration',
      generationTimeMs: 1,
    },
    imagePrompt: 'bearbeitet',
  }),
}));

const { startChatApp, userTurn } = await import('./harness/testApp.js');
const { runTurn, installNetworkGuard } = await import('./harness/trace.js');
const { createJournalCapture } = await import('./harness/journalCapture.js');
const { pinChatEnv } = await import('./harness/env.js');
const { createThread, resetThreadStore, setLastTurnArtifactsFixture, setThreadToolContextFixture } =
  await import('./harness/fakeThreadStore.js');
const { TEST_USER } = await import('./harness/fakeUser.js');
const { resetMockControls } = await import('./harness/mocks.js');
const { respond } = await import('./harness/respondScript.js');
const { loopScript } = await import('./harness/loopScript.js');
const { searchBackend } = await import('./harness/searchBackendStub.js');

const IMAGE = { kind: 'image' as const, ref: '/uploads/flux/results/t/vorher.jpg', label: 'Mühle' };

/** `edit`: der Turn kann das Bild ändern. `free`: er wird nicht dazu gezwungen. */
type Want = 'edit' | 'free';
interface Case {
  prompt: string;
  want: Want;
}

const CASES: Case[] = [
  // Die beiden Live-Turns.
  {
    prompt: 'Die Mühle soll ganz an den Rand und der Rentierschlitten in die Gegenrichtung fliegen',
    want: 'edit',
  },
  {
    prompt: 'passe die grafik noch einmal an, mit der Möglichkeit des Downloads in hoher Auflösung',
    want: 'edit',
  },
  { prompt: 'passe die grafik an', want: 'edit' },
  { prompt: 'Pass das Bild nochmal an', want: 'edit' },
  { prompt: 'noch einmal, aber mit Schnee', want: 'edit' },
  { prompt: 'Mach den Himmel dunkler', want: 'edit' },
  { prompt: 'kannst du die Mühle weglassen?', want: 'edit' },
  { prompt: 'lieber im Comic-Stil', want: 'edit' },
  { prompt: 'die Farben bitte wärmer', want: 'edit' },
  { prompt: 'Rentiere statt Schlitten', want: 'edit' },
  { prompt: 'etwas weniger kitschig bitte', want: 'edit' },
  { prompt: 'die Skyline soll nach Berlin aussehen', want: 'edit' },
  { prompt: 'Kannst du noch Schneeflocken hinzufügen?', want: 'edit' },
  { prompt: 'bearbeite das Bild', want: 'edit' },
  { prompt: 'Das gefällt mir nicht, versuch es anders', want: 'edit' },
  // Sehr kurz: unter drei Wörtern gilt ein Turn dem Router als in sich geschlossen.
  { prompt: 'nochmal', want: 'edit' },
  { prompt: 'heller', want: 'edit' },
  { prompt: 'mit Schnee', want: 'edit' },
  { prompt: 'ohne Mühle', want: 'edit' },
  { prompt: 'größer bitte', want: 'edit' },
  { prompt: 'anders', want: 'edit' },
  // Gegenproben: das Bild darf da sein, gemeint ist es nicht.
  { prompt: 'danke!', want: 'free' },
  { prompt: 'Erklär mir nochmal, was du gemacht hast', want: 'free' },
  { prompt: 'Schreib mir einen Instagram-Post zum Weihnachtsmarkt', want: 'free' },
  { prompt: 'Wann ist der Weihnachtsmarkt in Münster?', want: 'free' },
];

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
  capture.reset();
  loopScript.reset();
  searchBackend.reset();
});

/** Ein Thread, dessen letztes Artefakt das Bild ist. `rightAfter`: es kam im Turn davor. */
async function imageThread(rightAfter: boolean): Promise<string> {
  const thread = await createThread(TEST_USER.id, 'gruenerator-universal', 'Bild-Thread');
  setThreadToolContextFixture(thread.id, IMAGE);
  setLastTurnArtifactsFixture(thread.id, rightAfter ? [IMAGE] : []);
  return thread.id;
}

interface Row {
  prompt: string;
  context: string;
  intent: string | null;
  lane: string;
  editImageOnOffer: boolean;
  canEdit: boolean;
}

async function probe(prompt: string, threadId: string, context: string): Promise<Row> {
  loopScript.script({ text: 'Antwort.' });
  const { trace } = await runTurn(app.baseUrl, {
    threadId,
    messages: [
      userTurn('Mach mir ein Bild: Mühle und Rentierschlitten über der Skyline', 'm1'),
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hier ist dein Bild.' }] },
      userTurn(prompt, 'm2'),
    ],
  });
  const lane =
    capture
      .last()
      .entries.find((e) => e.point === 'router.run_agentic')
      ?.chose?.toString() ?? '?';
  const editImageOnOffer = loopScript.calls[0]?.toolNames.includes('edit_image') ?? false;
  return {
    prompt,
    context,
    intent: trace.intent,
    lane,
    editImageOnOffer,
    canEdit: trace.intent === 'image_edit' || editImageOnOffer,
  };
}

const rows: Row[] = [];
afterAll(() => {
  const out = process.env['IMAGE_MATRIX_OUT'];
  if (out) writeFileSync(out, JSON.stringify(rows, null, 2));
});

describe('Folgeauftrag auf ein erzeugtes Bild', () => {
  describe.each([
    ['direkt nach dem Bild', true],
    ['nach einem Turn ohne Bild dazwischen', false],
  ])('%s', (context, rightAfter) => {
    it.each(CASES.map((c) => [c.prompt, c] as const))('%s', async (_p, c) => {
      const row = await probe(c.prompt, await imageThread(rightAfter), context);
      rows.push(row);
      if (c.want === 'edit') {
        expect(row.canEdit, JSON.stringify(row)).toBe(true);
      } else {
        expect(row.intent, JSON.stringify(row)).not.toBe('image_edit');
      }
    });
  });

  it('montiert edit_image nicht ohne Bild im Gespräch', async () => {
    const thread = await createThread(TEST_USER.id, 'gruenerator-universal', 'Ohne Bild');
    const row = await probe('passe die grafik an', thread.id, 'ohne Bild');
    rows.push(row);
    expect(row.editImageOnOffer).toBe(false);
  });
});

describe('edit_image im Loop', () => {
  it('ändert das Bild und lässt die Behauptung stehen', async () => {
    const threadId = await imageThread(true);
    loopScript.script({
      calls: [{ tool: 'edit_image', args: { anweisung: 'Mühle an den Rand' } }],
      text: 'Ich habe die Grafik angepasst: Die Mühle steht jetzt am Rand.',
    });
    const { trace, events } = await runTurn(app.baseUrl, {
      threadId,
      messages: [userTurn('Die Mühle soll ganz an den Rand')],
    });
    const done = events.find((e) => e.event === 'image_complete');
    expect((done?.data as { image?: { url?: string } } | undefined)?.image?.url).toBe(
      '/uploads/flux/results/t/nachher.jpg'
    );
    expect(trace.fullText).toContain('Ich habe die Grafik angepasst');
  });

  it('streicht „Ich habe die Grafik angepasst", wenn das Modell das Werkzeug nicht rief', async () => {
    const threadId = await imageThread(true);
    loopScript.script({
      text: 'Ich habe die Grafik noch einmal angepasst. Soll ich daraus ein Sharepic machen?',
    });
    const { trace } = await runTurn(app.baseUrl, {
      threadId,
      messages: [userTurn('Die Mühle soll ganz an den Rand')],
    });
    expect(trace.fullText).not.toContain('angepasst');
  });
});
