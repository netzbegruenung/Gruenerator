/**
 * A pasted text plus an order about it — through the real classifier, router
 * and loop catalogue, with the model scripted.
 *
 * Live 29.09.2026: „rechtschreibung korrigieren" with a pasted newsletter came
 * back as a summary. Two gates lined up for it: a composer notebook turned every
 * attachment turn into a forced search (`AttachmentDefaultNotebook` → loop under
 * `toolChoice: required`), and `summarize` was mounted on every loop turn — the
 * one tool whose description names "die angehängten Dokumente".
 *
 * One case per phrasing people use on pasted text, with and without a composer
 * notebook. Each asserts the lane, whether `summarize` was on offer, and that
 * whoever writes the answer actually sees the paste.
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

const NEWSLETTER = [
  'Das Herbst-Update',
  'Hallo {{ contact.VORNAME | default : " " }},',
  'Jacob Coxon hat Anfang September seinen Job bei Anthropic gekündigt. Führende KI-Unternehmen würden trotz möglicher existenzieller Gefahren immer leistungsfähigere Systeme entwickeln und damit „mit unseren Leben spielen“.',
  'Für besondere Aufmerksamkeit sorgte dann eine Einschätzung des Sicherheitsforschers Evan Hubinger, der die Warscheinlichkeit auf über 10 Prozent schätzt.',
  '## Neue Funktionen',
  'Die Grünerator Apps für Android und iOS sind da. Ein Highlight ist der Untertitler für Reels auf Instagram.',
  'Mit Magic Search werden euch während des Tippens passende Textstellen aus euren Notebooks angezeigt. Beim Klick auf das Dokument werden euch die relevanten Textstellen markiert.',
  // „Zusammenfassungen" im MATERIAL: das Wort darf den Auftrag nicht umdeuten.
  'Der Chat kann jetzt gezielt in Notebooks suchen, etwa nach Pressemitteilungen, und daraus Zusammenfassungen erstellen.',
  'Neu sind außerdem Einsteiger-Guides für Anträge, Social-Media-Texte und Untertitel sowie ein Papierkorb.',
].join('\n\n');
const PASTE = `${NEWSLETTER}\n\n`.repeat(3).slice(0, 4899);

function pasteAttachment(text: string): Record<string, unknown> {
  const data = Buffer.from(text, 'utf8').toString('base64');
  return {
    name: 'Eingefügter Text.txt',
    type: 'text/plain',
    size: text.length,
    isImage: false,
    data,
  };
}

const NOTEBOOK = { defaultNotebookId: 'bundestagsfraktion-notebook' };

interface Case {
  id: string;
  prompt: string;
  body?: Record<string, unknown>;
  /** A first turn in the same thread, with the same paste. */
  after?: string;
  lane: 'loop' | 'single_pass';
  /** Only asserted on loop turns. */
  summarizeMounted?: boolean;
  /** Asserted when set: did the classifier force the notebook search (#5484)? */
  forcedSearch?: boolean;
}

const CASES: Case[] = [
  { id: 'korrigieren', prompt: 'rechtschreibung korrigieren', lane: 'single_pass' },
  {
    id: 'nachgereicht',
    prompt: 'hängt doch an',
    after: 'rechtschreibung korrigieren',
    // Geflippt mit dem Loop-Standard: „hängt doch an" nennt keine Umarbeitung,
    // also hält nichts den Turn draussen (`reworks_own_material` liest den Text).
    lane: 'loop',
    summarizeMounted: false,
  },
  { id: 'uebersetzen', prompt: 'bitte übersetze das ins Englische', lane: 'single_pass' },
  { id: 'kuerzen', prompt: 'kürze den Text auf die Hälfte', lane: 'single_pass' },
  // Geflippt: keine Umarbeitung des Materials, sondern ein Erstell-Auftrag daraus.
  {
    id: 'social',
    prompt: 'mach daraus einen Instagram-Post',
    lane: 'loop',
    summarizeMounted: false,
  },
  { id: 'gendern', prompt: 'gendere den Text', lane: 'single_pass' },
  {
    id: 'korrigiere-alles',
    prompt: 'korrigiere bitte alle Rechtschreib- und Grammatikfehler im Text',
    lane: 'single_pass',
  },
  { id: 'lektorat-frage', prompt: 'kannst du das lektorieren?', lane: 'single_pass' },
  // Geflippt: ohne Auftragstext gibt es nichts, was den Turn draussen hält.
  { id: 'nur-paste', prompt: '', lane: 'loop', summarizeMounted: false },
  {
    id: 'fehlerliste',
    prompt: 'prüfe den Text auf Fehler und gib mir eine Liste',
    lane: 'loop',
    summarizeMounted: false,
  },
  { id: 'worum', prompt: 'worum geht es hier?', lane: 'loop', summarizeMounted: false },
  {
    id: 'recherche',
    prompt: 'stimmen die Zahlen im Text? recherchiere das',
    lane: 'loop',
    summarizeMounted: false,
  },
  // Geflippt (#5399): ein Ganzdokument-Turn, dessen Text ganz beim Schreiber
  // liegt — `summarize` läse ihn nur ein zweites Mal (live 22 s Map-Reduce).
  { id: 'zusammenfassen', prompt: 'fasse das zusammen', lane: 'loop', summarizeMounted: false },
  {
    id: 'nb-korrigieren',
    prompt: 'rechtschreibung korrigieren',
    body: NOTEBOOK,
    lane: 'single_pass',
  },
  {
    id: 'nb-uebersetzen',
    prompt: 'bitte übersetze das ins Englische',
    body: NOTEBOOK,
    lane: 'single_pass',
  },
  {
    id: 'nb-kuerzen',
    prompt: 'kürze den Text auf die Hälfte',
    body: NOTEBOOK,
    lane: 'single_pass',
  },
  {
    id: 'nb-lektorat-frage',
    prompt: 'kannst du das lektorieren?',
    body: NOTEBOOK,
    lane: 'single_pass',
  },
  { id: 'nb-gendern', prompt: 'gendere den Text', body: NOTEBOOK, lane: 'single_pass' },
  {
    id: 'nb-zusammenfassen',
    prompt: 'fasse das zusammen',
    body: NOTEBOOK,
    lane: 'loop',
    summarizeMounted: false,
  },
  // Gegenprobe: dafür gibt es die erzwungene Notebook-Suche — sie bleibt.
  {
    id: 'nb-antwort',
    prompt: 'beantworte diese Bürgeranfrage mit unseren Positionen',
    body: NOTEBOOK,
    lane: 'loop',
    summarizeMounted: false,
  },
  // „kurze" trifft das Umschreib-Muster (`k[üu]rze…`), der Auftrag ist aber eine Antwort.
  {
    id: 'nb-kurze-antwort',
    prompt: 'Schreib eine kurze Antwort auf diese Bürgeranfrage mit unseren Positionen',
    body: NOTEBOOK,
    lane: 'loop',
    summarizeMounted: false,
  },
  {
    id: 'nb-fehlerliste',
    prompt: 'prüfe den Text auf Fehler und gib mir eine Liste',
    body: NOTEBOOK,
    lane: 'loop',
    summarizeMounted: false,
  },
  // Ein gewähltes Rezept, das Recherche verlangt, zählt wie ein Notebook: der
  // eingefügte Katalog ist Material, die Antwort braucht die Suche (Eval
  // 05.11.2026: ohne diese Regel 0 von 12 Katalogen mit auch nur einer Suche).
  {
    id: 'rezept-wahlpruefstein',
    prompt: 'Beantworte diesen Wahlprüfstein-Katalog.',
    body: { activeSkillMention: 'wahlpruefstein' },
    lane: 'loop',
    summarizeMounted: false,
  },
  {
    id: 'rezept-korrigieren',
    prompt: 'rechtschreibung korrigieren',
    body: { activeSkillMention: 'wahlpruefstein' },
    lane: 'single_pass',
  },
  // #5484: die Zeile stellt den Paste nur vor — keine erzwungene Suche, der
  // Paste bleibt Material (Einzeldurchlauf wie ohne Notebook gibt es nicht, der
  // Turn läuft im Loop, aber ohne Zwangs-Suche).
  {
    id: 'nb-nur-vorgestellt',
    prompt: 'Hier sind die Termine',
    body: NOTEBOOK,
    lane: 'loop',
    summarizeMounted: false,
    forcedSearch: false,
  },
  // Gegenprobe: ein Ein-Rezept-Agent, dessen Rezept die Recherche verlangt
  // (Bürger*innenanfragen), sucht auch bei einer bloß vorstellenden Zeile.
  {
    id: 'buerger-nur-vorgestellt',
    prompt: 'Hier ist die Mail',
    body: { ...NOTEBOOK, agentId: 'gruenerator-buergeranfragen-berlin' },
    lane: 'loop',
    summarizeMounted: false,
    forcedSearch: true,
  },
  // Gegenprobe: eine Antwort-Bestellung behält die Suche.
  {
    id: 'nb-antwort-auf-mail',
    prompt: 'Antworte auf diese Mail',
    body: NOTEBOOK,
    lane: 'loop',
    summarizeMounted: false,
    forcedSearch: true,
  },
  // Der Auftrag steht im Turn davor, dieser Turn traegt keinen: die Notebook-
  // Suche bleibt, aber ohne `summarize` als Koeder.
  {
    id: 'nb-nachgereicht',
    prompt: 'hängt doch an',
    after: 'rechtschreibung korrigieren',
    body: NOTEBOOK,
    lane: 'loop',
    summarizeMounted: false,
  },
];

const ANSWER = { text: 'Hier ist die korrigierte Fassung.' };

const pool = createProviderStub();
const capture = createJournalCapture();
let app: Awaited<ReturnType<typeof startChatApp>>;
let restoreNetwork: () => void;

beforeAll(async () => {
  restoreNetwork = installNetworkGuard();
  app = await startChatApp({ decisionJournal: capture.middleware });
  // Wegwerf-Turn für die Einmalkosten des ersten Requests (siehe loopRun, #3226).
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
});

describe('pasted text + an order about it', () => {
  it.each(CASES.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    const attachments = [pasteAttachment(PASTE)];
    let threadId: string | null = null;
    if (c.after) {
      loopScript.script(ANSWER, ANSWER);
      const first = await runTurn(app.baseUrl, {
        messages: [userTurn(c.after)],
        attachments,
        ...c.body,
      });
      threadId = first.trace.threadId;
      loopScript.reset();
    }

    // Split mode: planner, then writer. Not asserted as consumed — a
    // single-pass turn never reaches the loop, and that IS the assertion.
    loopScript.script(ANSWER, ANSWER);
    const messages = c.after
      ? [
          userTurn(c.after, 'm1'),
          { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: ANSWER.text }] },
          userTurn(c.prompt, 'm2'),
        ]
      : [userTurn(c.prompt)];
    await runTurn(app.baseUrl, {
      messages,
      attachments,
      ...(threadId ? { threadId } : {}),
      ...c.body,
    });

    const lane = capture
      .last()
      .entries.filter((e) => e.point === 'router.run_agentic')
      .map((e) => e.chose);
    expect(lane, `${c.id}: lane`).toEqual([c.lane]);

    if (c.lane === 'loop') {
      const planner = loopScript.calls[0];
      const writer = loopScript.calls[loopScript.calls.length - 1];
      expect(planner?.toolNames.includes('summarize'), `${c.id}: summarize on offer`).toBe(
        c.summarizeMounted
      );
      // Die erzwungene Notebook-Suche setzt `toolChoice: required` im ersten Schritt.
      if (c.forcedSearch !== undefined) {
        expect(planner?.toolChoice === 'required', `${c.id}: forced search`).toBe(c.forcedSearch);
      }
      // System ODER Nachrichten: bei einem Turn ohne Auftragstext steht das
      // Eingefügte in der Nutzernachricht, nicht im Systemprompt.
      expect(
        `${writer?.system ?? ''}${writer?.messagesJson ?? ''}`,
        `${c.id}: the writer sees the paste`
      ).toContain('Coxon');
    } else {
      expect(loopScript.calls, `${c.id}: no planner call`).toEqual([]);
      expect(
        JSON.stringify(respond.singlePassCalls.at(-1)?.messages ?? ''),
        `${c.id}: the writer sees the paste`
      ).toContain('Coxon');
    }
  });
});
