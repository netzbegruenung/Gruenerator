/**
 * Der erzwungene erste Planer-Schritt (#3880), echte Turns bis zum Modell.
 *
 * Die Harness entscheidet alles bis zum Modell echt — Klassifikator, Router,
 * Werkzeugkatalog, `shouldForceFirstToolCall`, `forcedFirstStepTools` — und
 * fängt den ersten `streamText`-Aufruf des Planers ab. Zwei Stufen:
 *
 * IMMER (CI): jeder Fall muss den ersten Schritt erzwingen, ein passendes
 * Werkzeug erreichbar halten und keinen der Köder zeigen, zu denen der Planer
 * unter dem vollen Katalog griff (`media`, `read_pdf_form`, `summarize` …).
 *
 * LIVE (`FORCE_LIVE=1` + echter `GREENPT_API_KEY`): derselbe Schritt 0 geht
 * zweimal an das Produktionsmodell der Standard-Gemma-Lane (`GEMMA_31B_ON_MELIOUS`) —
 * mit dem Zuschnitt und ohne (master: `required` über den ganzen Katalog, weil
 * `toolScope` im Schattenbetrieb läuft). Gezählt wird, welches Werkzeug der
 * Planer als erstes ruft; kein Werkzeug läuft, die Aufrufe gehen ohne
 * `execute` hinaus. Kleiner als die Chat-Eval, weil nur der eine Schritt
 * gemessen wird, den die Änderung berührt.
 *   FORCE_LIVE=1 GREENPT_API_KEY=… npx vitest run routes/chat/__integration__/forcedFirstStep.vitest.ts
 * Die Tabelle landet in `FORCE_LIVE_OUT` (Vorgabe: tmpdir), weil `console.log`
 * aus dem Lauf nicht ankommt. GreenPTs Kontingent teilt sich die Produktion —
 * ein Lauf sind CASES × 2 × REPS Aufrufe.
 *
 * Der Fake-Store kennt keine Werkzeugschritte früherer Turns (#3891); die
 * Anschlussfälle legen sie über `ctl.priorSteps` selbst hinein.
 */
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { type LanguageModel, type ModelMessage, type ToolSet } from 'ai';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ctl = vi.hoisted(() => ({
  captured: [] as Array<Record<string, unknown>>,
  /** Die Werkzeugschritte früherer Turns — der Fake-Store kennt keine. */
  priorSteps: [] as unknown[],
  /** Der Vorab-Seed der angehängten Dokumente findet nichts. */
  emptySeed: false,
}));

vi.mock('../../../services/ai/execution/index.js', async () => {
  const { executeProviderStub } = await import('./harness/providerStub.js');
  return { executeProvider: executeProviderStub };
});
// Eine Person ohne gespeicherte Inhalte, statt jeder Abfrage einen Fehler: der
// Rezeptkatalog soll montiert werden wie in Produktion.
vi.mock('../../../database/services/PostgresService.js', async () => ({
  getPostgresInstance: () => ({ query: () => Promise.resolve([]) }),
}));
vi.mock('../services/threadPersistenceService.js', async () => {
  const store = await import('./harness/fakeThreadStore.js');
  return {
    ...store,
    readThreadToolHistory: async (threadId: string) => ({
      ...(await store.readThreadToolHistory(threadId)),
      toolSteps: () => ctl.priorSteps,
      lastTurnToolSteps: () => ctl.priorSteps,
    }),
  };
});
vi.mock('../services/documentScopeAccess.js', async () => {
  const { ownedDocumentScopeMock } = await import('./harness/mocks.js');
  return ownedDocumentScopeMock();
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
vi.mock('../../../services/bundestag/BundestagEnrichedService.js', async (orig) => {
  const { fakeBundestagService } = await import('./harness/searchBackendStub.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    getBundestagEnrichedService: fakeBundestagService,
  };
});
vi.mock('../../../services/monitor/UmfragenService.js', async (orig) => {
  const { fakeLookupUmfragen } = await import('./harness/searchBackendStub.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    lookupUmfragen: fakeLookupUmfragen,
  };
});
vi.mock('../../../services/document-services/DocumentSearchService/index.js', async (orig) => {
  const { fakeQdrantDocumentService } = await import('./harness/searchBackendStub.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    getQdrantDocumentService: () =>
      ctl.emptySeed
        ? {
            search: () => Promise.resolve({ results: [] }),
            getMultipleDocumentsFullText: () => Promise.resolve({ documents: [] }),
          }
        : fakeQdrantDocumentService(),
  };
});
// Jeder Loop-Aufruf wird nur aufgezeichnet und endet mit Text: der Zug läuft
// zu Ende, das Modell sieht erst der Test — und nur den ersten Schritt.
vi.mock('ai', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  streamText: (options: Record<string, unknown>) => {
    ctl.captured.push(options);
    return {
      stream: (async function* () {
        yield { type: 'text-delta', text: 'Eine Antwort.' };
      })(),
    };
  },
  generateText: () => Promise.resolve({ text: '' }),
}));
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

const { generateText } = await vi.importActual<typeof import('ai')>('ai');
const { GEMMA_31B_ON_MELIOUS } = await import('../../../services/ai/gemmaHosts.js');
const { startChatApp, userTurn } = await import('./harness/testApp.js');
const { runTurn, installNetworkGuard } = await import('./harness/trace.js');
const { createProviderStub } = await import('./harness/providerStub.js');
const { pinChatEnv } = await import('./harness/env.js');
const { resetThreadStore } = await import('./harness/fakeThreadStore.js');
const { resetMockControls } = await import('./harness/mocks.js');
const { respond } = await import('./harness/respondScript.js');
const { searchBackend } = await import('./harness/searchBackendStub.js');

const LIVE = process.env.FORCE_LIVE === '1';
// Vor `pinChatEnv` gelesen, das den Schlüssel sonst leert.
const GREENPT_KEY = process.env.GREENPT_API_KEY ?? '';
const REPS = 3;
const OUT = process.env.FORCE_LIVE_OUT ?? path.join(os.tmpdir(), 'forced-first-step-live.md');

const PASTE = [
  'Windkraft an Land: 2025 wurden in Deutschland 1.200 neue Anlagen mit zusammen 5,1 Gigawatt errichtet.',
  'Der Anteil erneuerbarer Energien am Bruttostromverbrauch lag damit bei 62 Prozent.',
  'Die Genehmigungsdauer sank laut Branchenverband auf durchschnittlich 18 Monate.',
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

const BUERGERANFRAGE = [
  'Sehr geehrte Damen und Herren,',
  'in unserer Straße wird seit Monaten zu schnell gefahren. Wie stehen die Grünen zu Tempo 30 innerorts, und was tun Sie konkret dafür?',
  'Mit freundlichen Grüßen, Petra Lindner',
].join('\n\n');

/**
 * Die Werkzeuge, zu denen der Planer unter `required` über den vollen Katalog
 * griff (#3880 und die Live-Messung dazu) — keins davon holt, was ein
 * erzwungener Schritt holen soll.
 */
const DECOYS = [
  'media',
  'find_content',
  'read_artifact',
  'summarize',
  'read_pdf_form',
  'rezept_laden',
  'meine_inhalte_laden',
];
/** Die Köder ohne `rezept_laden` — für Material-Turns, deren Zuschnitt es mitführt (#4785). */
const NOT_RECIPE_DECOYS = DECOYS.filter((t) => t !== 'rezept_laden');

interface Case {
  id: string;
  prompt: string;
  body?: Record<string, unknown>;
  locale?: 'de-AT';
  /** Ein Turn davor im selben Thread, welche Werkzeuge er rief, und ob sie scheiterten. */
  before?: { prompt: string; steps: string[]; failed?: boolean };
  emptySeed?: boolean;
  /** Die Werkzeuge, die als ERSTER Aufruf zum Auftrag passen. */
  fits: readonly string[];
  /** Was der erzwungene Schritt NICHT zeigen darf. Vorgabe: `DECOYS`. */
  without?: readonly string[];
}

function priorStep(toolName: string, i: number, before: NonNullable<Case['before']>) {
  return {
    toolCallId: `prior-${i}`,
    toolName,
    args: { query: before.prompt },
    ...(before.failed
      ? { ok: false as const, result: { error: 'Keine Treffer.' } }
      : { result: { results: [{ title: 'Ein Treffer zur Frage davor' }] } }),
  };
}

const CASES: Case[] = [
  {
    id: 'recherche',
    prompt: 'recherchiere aktuelle Zahlen zum Windkraftausbau in Deutschland',
    fits: ['web_search'],
  },
  {
    id: 'paste-recherche',
    prompt: 'stimmen die Zahlen im Text? recherchiere das',
    body: { attachments: [pasteAttachment(PASTE)] },
    fits: ['web_search'],
  },
  {
    id: 'grundsatzprogramm',
    prompt: 'Was steht im Grundsatzprogramm der Grünen zum Tierschutz?',
    fits: ['gruenerator_search'],
  },
  // Die eigenen Inhalte öffnen ihre ganze Gruppe — `media` und `read_artifact`
  // gehören hier dazu.
  {
    id: 'meine-dokumente',
    prompt: 'such in meinen Dokumenten nach dem Antrag zur Radverkehrsstrategie',
    fits: ['documents', 'find_content'],
    without: ['summarize', 'read_pdf_form', 'rezept_laden', 'meine_inhalte_laden'],
  },
  // Österreich: die Bundestags-Werkzeuge sind nicht montiert, die Websuche bleibt.
  {
    id: 'recherche-at',
    locale: 'de-AT',
    prompt: 'recherchiere die aktuelle Arbeitslosenquote in Österreich',
    fits: ['web_search'],
    without: [...DECOYS, 'bundestag'],
  },
  {
    id: 'bundestag',
    prompt: 'Wie hat die Unionsfraktion im Bundestag über das Heizungsgesetz abgestimmt?',
    fits: ['bundestag', 'abgeordnetenwatch'],
  },
  // Anschlussfragen nach einem Abruf-Turn („Und die FDP?") erzwingen seit dem
  // 09.11.2026 keinen ersten Schritt mehr — das Modell entscheidet mit dem
  // Verlauf. Die Fälle `anschlussfrage` und `anschlussfrage-partei` sind deshalb weg.
  // Das Protokoll aus #3778: zweimal `notebooks` gescheitert, dann „finde es".
  // `research_order` zwingt, das gescheiterte Werkzeug muss
  // wiederholbar bleiben. Passend ist auch der Quellenwechsel: „berlin" ist
  // eine Systemsammlung, die `gruenerator_search` direkt erreicht — live wählt
  // der Planer genau die, nie die Wiederholung.
  {
    id: 'finde-es',
    before: {
      prompt: 'was stand in der letzen pressemitteilung im notebook berlin',
      steps: ['notebooks', 'notebooks'],
      failed: true,
    },
    prompt: 'finde es',
    fits: ['notebooks', 'gruenerator_search'],
  },
  // Der Seed findet im Anhang nichts — der Fall, den das Review fand (#3888).
  {
    id: 'pdf-seed-leer',
    prompt: 'erstelle daraus eine tabelle',
    body: { documentChatIds: ['doc-1'] },
    emptySeed: true,
    fits: ['dokumente_lesen'],
  },
  {
    id: 'pdf-seed-leer-frage',
    prompt: 'welche Forderungen stehen in dem Dokument?',
    body: { documentChatIds: ['doc-1'] },
    emptySeed: true,
    fits: ['dokumente_lesen'],
  },
  // Hier passt der Programmabgleich ebenso wie das Dokument.
  {
    id: 'pdf-seed-leer-vergleich',
    prompt: 'vergleiche das Dokument mit unserem Wahlprogramm',
    body: { documentChatIds: ['doc-1'] },
    emptySeed: true,
    fits: ['dokumente_lesen', 'gruenerator_search'],
  },
  // Die Familie von #3878: Einfügung plus Composer-Notebook.
  {
    id: 'nb-buergeranfrage',
    prompt: 'beantworte diese Bürgeranfrage mit unseren Positionen',
    body: {
      attachments: [pasteAttachment(BUERGERANFRAGE)],
      defaultNotebookId: 'bundestagsfraktion-notebook',
    },
    fits: ['gruenerator_search', 'notebooks', 'notebook_quellen'],
    // Einfügung + Auftrag („beantworte …") ist ein Material-Turn wie der
    // Insta-Fall unten: `rezept_laden` ist im Zuschnitt, ein Rezept (Bürgermail)
    // gehört zu dieser Textsorte.
    without: NOT_RECIPE_DECOYS,
  },
  // #4785: Einfügung plus Schreibauftrag. Der Prompt verlangt das Rezept
  // zuerst; ohne es im Zuschnitt hing Gemma unter `required` über 50 s.
  {
    id: 'paste-instagram-post',
    prompt: 'Mach daraus bitte einen Instagram-Post',
    body: {
      attachments: [pasteAttachment(PASTE)],
      defaultNotebookId: 'bundestagsfraktion-notebook',
    },
    fits: ['rezept_laden'],
    without: NOT_RECIPE_DECOYS,
  },
];

// Recherche-Turns dürfen im erzwungenen Schritt eine Methode laden (Beschlusslage,
// Rechtsstand, Bundestagsrecherche), nie eine Textsorte (#3880).
describe('forced research step offers a method recipe', () => {
  const pool = createProviderStub();
  let app: Awaited<ReturnType<typeof startChatApp>>;
  let restoreNetwork: (() => void) | null = null;

  beforeAll(async () => {
    restoreNetwork = installNetworkGuard();
    app = await startChatApp();
  }, 60_000);
  afterAll(async () => {
    await app?.close();
    restoreNetwork?.();
  });
  beforeEach(() => {
    pinChatEnv({ LOOP_TOOL_SCOPE_ENFORCE: 'false' });
    resetThreadStore();
    resetMockControls();
    respond.reset();
    pool.reset();
    searchBackend.reset();
    ctl.captured.length = 0;
    ctl.priorSteps = [];
    ctl.emptySeed = false;
  });

  it.each([
    ['grundsatzprogramm', 'Was steht im Grundsatzprogramm der Grünen zum Tierschutz?'],
    ['bundestag', 'Wie hat die Unionsfraktion im Bundestag über das Heizungsgesetz abgestimmt?'],
  ])('%s: methode_laden steht im ersten Aufruf, rezept_laden nicht', async (_id, prompt) => {
    await runTurn(app.baseUrl, { messages: [userTurn(prompt)] });
    const planner = ctl.captured[0];
    expect(planner).toBeDefined();
    if (!planner) return;
    const step0 = (planner.prepareStep as PrepareStep)({ stepNumber: 0, steps: [] });
    expect(step0.toolChoice).toBe('required');
    expect(step0.activeTools).toContain('methode_laden');
    expect(step0.activeTools).not.toContain('rezept_laden');
  });
});

// I1: der Alt-Token `@social` (F0, steht in persistierten Threads) darf nicht im
// Einzeldurchlauf landen — dort gibt es keine Rezeptwahl mehr.
describe('legacy @social token keeps the recipe catalogue', () => {
  const pool = createProviderStub();
  let app: Awaited<ReturnType<typeof startChatApp>>;
  let restoreNetwork: (() => void) | null = null;

  beforeAll(async () => {
    restoreNetwork = installNetworkGuard();
    app = await startChatApp();
  }, 60_000);
  afterAll(async () => {
    await app?.close();
    restoreNetwork?.();
  });
  beforeEach(() => {
    pinChatEnv({ LOOP_TOOL_SCOPE_ENFORCE: 'false' });
    resetThreadStore();
    resetMockControls();
    respond.reset();
    pool.reset();
    searchBackend.reset();
    ctl.captured.length = 0;
    ctl.priorSteps = [];
    ctl.emptySeed = false;
  });

  it('social_post + Text: der Turn läuft in der Schleife und `rezept_laden` ist montiert', async () => {
    await runTurn(app.baseUrl, {
      messages: [userTurn('Instagram-Post über unsere neue Radwegebrücke')],
      forcedTools: ['social_post'],
    });
    const planner = ctl.captured[0];
    expect(planner).toBeDefined();
    if (!planner) return;
    expect(Object.keys(planner.tools as ToolSet)).toContain('rezept_laden');
  });
});

interface Row {
  id: string;
  forced: string;
  narrowed: readonly string[] | null;
  mounted: number;
  master: string[];
  branch: string[];
}

const rows: Row[] = [];

type PrepareStep = (arg: { stepNumber: number; steps?: [] }) => {
  toolChoice?: unknown;
  system?: string;
  activeTools?: readonly string[];
};

/** Ohne `execute`: der Planer darf wählen, ausgeführt wird nichts. */
function withoutExecute(tools: ToolSet): ToolSet {
  // Grenz-Cast: ein Werkzeug ohne `execute` ist gewollt — das SDK gibt den
  // Aufruf dann nur zurück.
  return Object.fromEntries(
    Object.entries(tools).map(([name, t]) => [name, { ...t, execute: undefined }])
  ) as ToolSet;
}

async function firstCall(
  planner: Record<string, unknown>,
  step0: ReturnType<PrepareStep>,
  activeTools: readonly string[] | null
): Promise<string> {
  // Die Optionen stammen aus dem abgefangenen `streamText`-Aufruf des Loops —
  // die Casts sind die Grenze zu `Record<string, unknown>`.
  const result = await generateText({
    model: planner.model as LanguageModel,
    system: step0.system ?? (planner.system as string),
    messages: planner.messages as ModelMessage[],
    tools: withoutExecute(planner.tools as ToolSet),
    toolChoice: 'required',
    ...(activeTools && { activeTools: [...activeTools] }),
    ...(typeof planner.temperature === 'number' && { temperature: planner.temperature }),
    ...(typeof planner.maxOutputTokens === 'number' && {
      maxOutputTokens: planner.maxOutputTokens,
    }),
  });
  return result.toolCalls.map((c) => c.toolName).join('+') || '(keins)';
}

/** Wie oft der ERSTE gerufene Name zum Auftrag passt. */
function fitCount(picks: string[], fits: readonly string[]): number {
  return picks.filter((p) => fits.includes(p.split('+')[0] ?? '')).length;
}

function render(): string {
  const count = (picks: string[], fits: readonly string[]) =>
    `${fitCount(picks, fits)}/${picks.length}`;
  const lines = [
    `# Erzwungener erster Schritt, live — ${GEMMA_31B_ON_MELIOUS.provider}/${GEMMA_31B_ON_MELIOUS.model}, ${REPS} Wiederholungen`,
    '',
    '| Fall | Zwang | Katalog | Zuschnitt | passt master | passt Zuschnitt | master | Zuschnitt |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const fits = CASES.find((c) => c.id === r.id)?.fits ?? [];
    lines.push(
      `| ${r.id} | ${r.forced} | ${r.mounted} | ${r.narrowed ? r.narrowed.join(', ') : '—'} | ` +
        `${count(r.master, fits)} | ${count(r.branch, fits)} | ${r.master.join(', ')} | ${r.branch.join(', ')} |`
    );
  }
  return `${lines.join('\n')}\n`;
}

describe('forced first planner step', () => {
  const pool = createProviderStub();
  let app: Awaited<ReturnType<typeof startChatApp>>;
  let atApp: Awaited<ReturnType<typeof startChatApp>>;
  let restoreNetwork: (() => void) | null = null;

  beforeAll(async () => {
    // Nur der Live-Lauf darf hinaus — und nur zum Planer.
    if (!LIVE) restoreNetwork = installNetworkGuard();
    app = await startChatApp();
    atApp = await startChatApp({ user: { locale: 'de-AT' } });
  }, 60_000);

  afterAll(async () => {
    if (LIVE) writeFileSync(OUT, render(), 'utf8');
    await app?.close();
    await atApp?.close();
    restoreNetwork?.();
  });

  beforeEach(() => {
    // Der Vergleich misst master (Schattenbetrieb) gegen diesen Stand — der
    // Werkzeug-Umfang muss deshalb in beiden Armen im Schatten laufen.
    pinChatEnv({
      LOOP_TOOL_SCOPE_ENFORCE: 'false',
      ...(LIVE ? { GREENPT_API_KEY: GREENPT_KEY } : {}),
    });
    resetThreadStore();
    resetMockControls();
    respond.reset();
    pool.reset();
    searchBackend.reset();
    ctl.captured.length = 0;
    ctl.priorSteps = [];
    ctl.emptySeed = false;
  });

  it.each(CASES.map((c) => [c.id, c] as const))(
    '%s',
    async (_id, c) => {
      ctl.emptySeed = c.emptySeed ?? false;
      const baseUrl = c.locale === 'de-AT' ? atApp.baseUrl : app.baseUrl;
      if (c.before) {
        const before = c.before;
        const first = await runTurn(baseUrl, {
          messages: [userTurn(before.prompt)],
          ...c.body,
        });
        ctl.priorSteps = before.steps.map((tool, i) => priorStep(tool, i, before));
        ctl.captured.length = 0;
        await runTurn(baseUrl, {
          messages: [
            userTurn(c.before.prompt, 'm1'),
            { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Eine Antwort.' }] },
            userTurn(c.prompt, 'm2'),
          ],
          threadId: first.trace.threadId,
          ...c.body,
        });
      } else {
        await runTurn(baseUrl, { messages: [userTurn(c.prompt)], ...c.body });
      }

      const planner = ctl.captured[0];
      expect(planner, `${c.id}: der Zug erreichte den Loop nicht`).toBeDefined();
      if (!planner) return;

      const prepare = planner.prepareStep as PrepareStep;
      const step0 = prepare({ stepNumber: 0, steps: [] });
      // Ohne Schattenbetrieb hätte master schon einen Zuschnitt gehabt — dann
      // verglichen die zwei Arme nicht mehr master gegen diesen Stand.
      // Einzige Ausnahme: `methode_laden` gehört allein diesem Schritt und fehlt danach.
      const later = prepare({ stepNumber: 1, steps: [] }).activeTools;
      expect(later?.filter((t) => t === 'methode_laden') ?? []).toEqual([]);
      expect(
        later === undefined ||
          Object.keys(planner.tools as object)
            .filter((t) => t !== 'methode_laden')
            .every((t) => later.includes(t))
      ).toBe(true);

      expect(step0.toolChoice, `${c.id}: kein Zwang ohne benanntes Werkzeug`).toBe('required');
      const narrowed = step0.activeTools ?? [];
      expect(
        narrowed.length,
        `${c.id}: der erzwungene Schritt sieht den vollen Katalog`
      ).toBeGreaterThan(0);
      expect(
        c.fits.some((f) => narrowed.includes(f)),
        `${c.id}: kein passendes Werkzeug in [${narrowed.join(', ')}]`
      ).toBe(true);
      for (const decoy of c.without ?? DECOYS) {
        expect(narrowed, `${c.id}: ${decoy} im erzwungenen Schritt`).not.toContain(decoy);
      }

      if (!LIVE) return;
      const model = planner.model as { modelId?: string };
      expect(model.modelId, `${c.id}: nicht die Produktions-Lane des Planers`).toBe(
        GEMMA_31B_ON_MELIOUS.model
      );

      const row: Row = {
        id: c.id,
        forced:
          typeof step0.toolChoice === 'string'
            ? step0.toolChoice
            : JSON.stringify(step0.toolChoice ?? null),
        narrowed: step0.activeTools ?? null,
        mounted: Object.keys(planner.tools as object).length,
        master: [],
        branch: [],
      };
      rows.push(row);

      for (let i = 0; i < REPS; i++) {
        row.master.push(await firstCall(planner, step0, null));
        row.branch.push(await firstCall(planner, step0, step0.activeTools ?? null));
      }
      // Zugesichert wird, was die Änderung behauptet — nie schlechter als der
      // volle Katalog —, nicht Fehlerfreiheit: das Modell streut auch im
      // Zuschnitt, und die Tabelle zeigt wie.
      expect
        .soft(
          fitCount(row.branch, c.fits),
          `${c.id}: Zuschnitt [${row.branch.join(', ')}] gegen master [${row.master.join(', ')}]`
        )
        .toBeGreaterThanOrEqual(fitCount(row.master, c.fits));
    },
    LIVE ? 180_000 : 15_000
  );
});
