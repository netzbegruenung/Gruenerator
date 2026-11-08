/**
 * Folgeaufträge auf ein Artefakt im Gespräch — durch den echten Klassifikator,
 * Router und Loop-Katalog, das Modell geskriptet.
 *
 * Live 05.11.2026: nach einem KI-Bild antwortete der Chat zweimal „Ich habe die
 * Grafik angepasst", ohne dass ein Bildwerkzeug lief. „anpassen" und „noch
 * einmal" standen in keiner Bearbeitungs-Vokabel; der kurze Turn blieb als
 * „Folgeauftrag ≤ 12 Wörter" ohne Werkzeug, der lange kam in den Loop — der
 * kein Bildwerkzeug hatte. Dieselbe Ausnahme hielt kurze Folgeaufträge an
 * Sharepic, Dokument, Tabelle & Co. vom Loop fern, obwohl er für jede dieser
 * Arten ein Bearbeitungswerkzeug montiert.
 *
 * Jeder Fall sagt, ob der Turn das Artefakt ändern KANN: über eine
 * Einzeldurchlauf-Bearbeitung oder über das Werkzeug der Art im Loop. Die
 * Gegenproben sagen, dass kein Turn ungefragt zur Bearbeitung GEZWUNGEN wird.
 *
 * `FOLLOWUP_MATRIX_OUT=<datei>` schreibt die Tabelle vor den Zusicherungen — so
 * lässt sich dieselbe Matrix gegen einen älteren Stand fahren.
 */
import { writeFileSync } from 'node:fs';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ThreadToolContext } from '../../../agents/langgraph/ChatGraph/types.js';

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
vi.mock('../services/sharepicVariantHelpers.js', async (orig) => {
  const { sharepicVariantHelpersMock } = await import('./harness/mocks.js');
  return sharepicVariantHelpersMock((await orig()) as Record<string, unknown>);
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

// Die Tabellen-Bearbeitung im Einzeldurchlauf prüft den Schreibzugriff über einen
// eigenen Postgres-Zugang, an der Harness vorbei. Gefragt ist hier nur, ob der
// Turn diese Spur nimmt, nicht ob er schreiben darf.
vi.mock('../../docs/documentAccess.js', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  checkDocumentWriteAccess: async () => false,
}));

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
const {
  createThread,
  resetThreadStore,
  setLastTurnArtifactsFixture,
  setThreadArtifactsFixture,
  setThreadToolContextFixture,
} = await import('./harness/fakeThreadStore.js');
const { TEST_USER } = await import('./harness/fakeUser.js');
const { resetMockControls, sharepicControl } = await import('./harness/mocks.js');
const { respond } = await import('./harness/respondScript.js');
const { loopScript } = await import('./harness/loopScript.js');
const { searchBackend } = await import('./harness/searchBackendStub.js');

type Kind = 'image' | 'sharepic' | 'document' | 'sheet' | 'presentation' | 'explainable' | 'board';

/** Was die Art im Thread ist, und mit welchem Werkzeug der Loop sie ändert. */
const KINDS: Record<Kind, { ctx: ThreadToolContext; loopTool: string; created: string }> = {
  image: {
    ctx: { kind: 'image', ref: '/uploads/flux/results/t/vorher.jpg', label: 'Mühle' },
    loopTool: 'edit_image',
    created: 'Mach mir ein Bild: Mühle und Rentierschlitten über der Skyline',
  },
  sharepic: {
    ctx: { kind: 'sharepic', ref: null, label: 'Mehr Radwege jetzt' },
    loopTool: 'edit_sharepic',
    created: 'Mach ein Sharepic: Mehr Radwege jetzt',
  },
  document: {
    ctx: { kind: 'document', ref: 'doc-1', label: 'Antrag Radwege' },
    loopTool: 'edit_document_text',
    created: 'Erstelle ein Dokument: Antrag für mehr Radwege',
  },
  sheet: {
    ctx: { kind: 'sheet', ref: 'sheet-1', label: 'Mitglieder je Kreis' },
    loopTool: 'edit_sheet',
    created: 'Erstelle eine Tabelle mit den Mitgliederzahlen je Kreisverband',
  },
  presentation: {
    ctx: { kind: 'presentation', ref: 'deck-1', label: 'Radwege' },
    loopTool: 'edit_presentation',
    created: 'Erstelle eine Präsentation zu Radwegen',
  },
  explainable: {
    ctx: { kind: 'explainable', ref: 'expl-1', label: 'Wie funktioniert die Wärmepumpe?' },
    loopTool: 'edit_explainable',
    created: 'Erklär einfach, wie eine Wärmepumpe funktioniert',
  },
  board: {
    ctx: { kind: 'board', ref: 'board-1', label: 'Wahlkampf' },
    loopTool: 'boards_tasks',
    created: 'Leg ein Board für den Wahlkampf an',
  },
};

/** Bearbeitungswünsche ohne eindeutige Vokabel, je Art. */
const EDITS: Record<Kind, string[]> = {
  image: [
    'Die Mühle soll ganz an den Rand und der Rentierschlitten in die Gegenrichtung fliegen',
    'passe die grafik noch einmal an, mit der Möglichkeit des Downloads in hoher Auflösung',
    'passe die grafik an',
    'Pass das Bild nochmal an',
    'noch einmal, aber mit Schnee',
    'Mach den Himmel dunkler',
    'kannst du die Mühle weglassen?',
    'lieber im Comic-Stil',
    'die Farben bitte wärmer',
    'Rentiere statt Schlitten',
    'etwas weniger kitschig bitte',
    'die Skyline soll nach Berlin aussehen',
    'Kannst du noch Schneeflocken hinzufügen?',
    'bearbeite das Bild',
    'Das gefällt mir nicht, versuch es anders',
    'nochmal',
    'heller',
    'mit Schnee',
    'ohne Mühle',
    'größer bitte',
    'anders',
  ],
  sharepic: [
    'pass das noch an',
    'noch einmal, aber frecher',
    'ohne Ausrufezeichen',
    'die Headline knackiger',
    'und jetzt noch die Uhrzeit ergänzen',
    'Das Datum fehlt noch: Samstag, 14 Uhr',
    'Das gefällt mir nicht, versuch es anders',
    'kürzer',
    'blauer',
    'anders',
  ],
  document: [
    'pass das noch an',
    'der zweite Absatz ist zu lang',
    'mach das förmlicher',
    'lieber in Du-Form',
    'und jetzt noch eine Begründung ergänzen',
    'ohne die Zahlen am Ende',
    'Das gefällt mir nicht, versuch es anders',
    'kürzer',
    'förmlicher',
  ],
  sheet: [
    'pass das noch an',
    'noch eine Spalte für die Kosten',
    'sortier nach Datum',
    'Marburg fehlt noch',
    'die Summe stimmt nicht',
    'ohne die leeren Zeilen',
    'kürzer',
  ],
  presentation: [
    'pass das noch an',
    'Folie 3 raus',
    'noch eine Folie zum Fazit',
    'die Überschriften knackiger',
    'weniger Text pro Folie',
    'kürzer',
  ],
  explainable: [
    'pass das noch an',
    'einfacher bitte',
    'der zweite Abschnitt ist zu lang',
    'noch ein Beispiel dazu',
    'kürzer',
  ],
  board: [
    'pass das noch an',
    'die Karte Flyer auf erledigt',
    'noch eine Aufgabe: Plakate bestellen',
    'Plakate bis Freitag',
  ],
};

/** Gegenproben: das Artefakt ist da, gemeint ist es nicht. */
const FREE = [
  'danke!',
  'Erklär mir nochmal, was du gemacht hast',
  'Schreib mir einen Instagram-Post zum Weihnachtsmarkt',
  'Wann ist der Weihnachtsmarkt in Münster?',
];

/** Die Einzeldurchlauf-Bearbeitung, die eine Art ohne Loop hat. */
const SINGLE_PASS_EDIT: Partial<Record<Kind, string>> = {
  image: 'image_edit',
  sheet: 'edit_sheet',
};

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

/** Ein Thread, dessen letztes Artefakt `kind` ist. `rightAfter`: es kam im Turn davor. */
async function artifactThread(kind: Kind, rightAfter: boolean): Promise<string> {
  const { ctx } = KINDS[kind];
  const thread = await createThread(TEST_USER.id, 'gruenerator-universal', `${kind}-Thread`);
  setThreadToolContextFixture(thread.id, ctx);
  setThreadArtifactsFixture(thread.id, [ctx]);
  setLastTurnArtifactsFixture(thread.id, rightAfter ? [ctx] : []);
  if (kind === 'sharepic') {
    sharepicControl.threadHasSharepic = true;
    sharepicControl.lastVariant = {
      canvasType: 'dreizeilen',
      props: { line1: 'Mehr', line2: 'Radwege', line3: 'jetzt' },
    };
  }
  return thread.id;
}

interface Row {
  kind: Kind | 'none';
  prompt: string;
  context: string;
  intent: string | null;
  lane: string;
  editToolOnOffer: boolean;
  singlePassEdit: boolean;
  canEdit: boolean;
}

async function probe(kind: Kind, prompt: string, threadId: string, context: string): Promise<Row> {
  loopScript.script({ text: 'Antwort.' });
  const { trace, events } = await runTurn(app.baseUrl, {
    threadId,
    messages: [
      userTurn(KINDS[kind].created, 'm1'),
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hier ist es.' }] },
      userTurn(prompt, 'm2'),
    ],
  });
  const lane =
    capture
      .last()
      .entries.find((e) => e.point === 'router.run_agentic')
      ?.chose?.toString() ?? '?';
  const editToolOnOffer = loopScript.calls[0]?.toolNames.includes(KINDS[kind].loopTool) ?? false;
  // Sharepic hat eine eigene Bearbeitungs-Spur vor dem Loop. Sie scheitert hier
  // am Postgres-Wächter und meldet sich dabei mit `sharepic_edit_error`.
  const singlePassEdit =
    trace.intent === SINGLE_PASS_EDIT[kind] ||
    (kind === 'sharepic' && events.some((e) => e.event === 'sharepic_edit_error'));
  return {
    kind,
    prompt,
    context,
    intent: trace.intent,
    lane,
    editToolOnOffer,
    singlePassEdit,
    canEdit: singlePassEdit || editToolOnOffer,
  };
}

const rows: Row[] = [];
afterAll(() => {
  const out = process.env['FOLLOWUP_MATRIX_OUT'];
  if (out) writeFileSync(out, JSON.stringify(rows, null, 2));
});

const CONTEXTS = [
  ['direkt danach', true],
  ['ein Turn dazwischen', false],
] as const;

describe.each(Object.keys(KINDS) as Kind[])('Folgeauftrag auf %s', (kind) => {
  describe.each(CONTEXTS)('%s', (context, rightAfter) => {
    it.each(EDITS[kind])('kann ändern: %s', async (prompt) => {
      const row = await probe(kind, prompt, await artifactThread(kind, rightAfter), context);
      rows.push(row);
      expect(row.canEdit, JSON.stringify(row)).toBe(true);
    });

    it.each(FREE)('zwingt nicht zur Bearbeitung: %s', async (prompt) => {
      const row = await probe(kind, prompt, await artifactThread(kind, rightAfter), context);
      rows.push(row);
      expect(row.singlePassEdit, JSON.stringify(row)).toBe(false);
    });
  });
});

describe('ohne Artefakt im Gespräch', () => {
  it('montiert edit_image nicht', async () => {
    const thread = await createThread(TEST_USER.id, 'gruenerator-universal', 'Ohne Bild');
    const row = await probe('image', 'passe die grafik an', thread.id, 'ohne Artefakt');
    rows.push({ ...row, kind: 'none' });
    expect(row.editToolOnOffer).toBe(false);
  });
});

describe('edit_image im Loop', () => {
  it('ändert das Bild und lässt die Behauptung stehen', async () => {
    const threadId = await artifactThread('image', true);
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
    const threadId = await artifactThread('image', true);
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
