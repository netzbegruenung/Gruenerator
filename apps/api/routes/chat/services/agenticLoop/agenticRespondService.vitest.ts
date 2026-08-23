/**
 * Der Orchestrierungskern des agentischen Pfads.
 *
 * Bis zur Zerlegung gab es dafür keinen einzigen Test: `streamAgenticResponse`
 * war nur über `__integration__/loopRun` mitgeprüft, das den echten Service auf
 * einem ersetzten `streamText` laufen lässt und deshalb den ganzen Turn misst,
 * nicht die Entscheidungen darin.
 *
 * Hier wird genau das geprüft, was der Orchestrator SELBST entscheidet — mit
 * gefakten Kollaborateuren (Muster: `loopEngine.vitest.ts` injiziert Fakes
 * statt eines MockLanguageModel):
 *  - welcher Modus läuft (unified/split, inkl. material-dominiert → split),
 *  - dass das Verdikt des Schreibers eine stille Wiederholung anordnen kann und
 *    die ersetzte Antwort über `completion` nachgereicht wird,
 *  - dass ein ausgefallener MCP-Katalog den Turn NICHT abbricht,
 *  - dass die Erstellungs-Werkzeuge ihre eigene Zeitgrenze bekommen.
 */
import { describe, it, expect, vi } from 'vitest';

import { streamAgenticResponse, type AgenticRespondDeps } from './agenticRespondService.js';
import { assembleToolCatalog, wrapAssembledTools, type CatalogDeps } from './catalogAssembly.js';
import { createAnswerValidator } from './synthVerdicts.js';
import {
  SYNTH_CUTOFF_RETRY_SUFFIX,
  SYNTH_INVALID_JSON_RETRY_SUFFIX,
  type LoopEngineParams,
} from './loopEngine.js';
import { TOOL_TIMEOUT_OVERRIDES_MS, type PersistedStep } from './types.js';
import { createSourceRegistry } from './sourceRegistry.js';
import { createToolLoopGuards } from './loopGuards.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../sseHelpers.js';
import type { ModelMessage, ToolSet } from 'ai';

type SentEvent = { event: string; payload: Record<string, unknown> };

function fakeSse(): { sse: SSEWriter; sent: SentEvent[] } {
  const sent: SentEvent[] = [];
  const sse = {
    send: (event: string, payload: Record<string, unknown>) => {
      sent.push({ event, payload });
    },
  } as unknown as SSEWriter;
  return { sse, sent };
}

const EMPTY_CATALOG = {
  tools: {} as ToolSet,
  mcpCatalog: null,
  systemCatalog: null,
  recipeCatalog: [],
  recipeRegistry: { render: () => '', register: () => {}, size: 0, summaries: () => [] },
  toolLabels: new Map<string, { serverName: string; toolName: string }>(),
  mcpMountMs: 0,
};

function fakeState(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    intent: 'agentic',
    agentConfig: {
      identifier: 'gruenerator-universal',
      provider: 'mistral',
      model: 'mistral-medium-2604',
      params: { temperature: 0.3 },
    },
    ...overrides,
  } as unknown as ChatGraphState;
}

/**
 * Deps that answer every collaborator with the cheapest thing that still lets
 * the turn run to completion. `onLoop` sees the params the orchestrator built —
 * which is what these tests are actually about.
 */
function fakeDeps(opts: {
  provider?: string;
  modelName?: string;
  onLoop?: (p: LoopEngineParams) => void;
  loopResult?: { text: string; replacedStreamed?: boolean };
  assemble?: AgenticRespondDeps['assembleToolCatalog'];
}): AgenticRespondDeps {
  return {
    resolveModel: (async () => ({
      model: {} as never,
      provider: opts.provider ?? 'mistral',
      modelName: opts.modelName ?? 'mistral-medium-2604',
      reasoningEffort: 'off',
      fromAutoPolicy: false,
    })) as unknown as AgenticRespondDeps['resolveModel'],
    assembleToolCatalog:
      opts.assemble ??
      ((async () => EMPTY_CATALOG) as unknown as AgenticRespondDeps['assembleToolCatalog']),
    runAgenticLoop: (async (p: LoopEngineParams) => {
      opts.onLoop?.(p);
      const text = opts.loopResult?.text ?? 'Fertige Antwort.';
      // Mirror what the real engine does for the caller's `text`: unified and
      // split both stream the answer through onText.
      if (!opts.loopResult?.replacedStreamed) p.onText(text);
      return opts.loopResult ?? { text };
    }) as unknown as AgenticRespondDeps['runAgenticLoop'],
  };
}

const baseParams = (state: ChatGraphState, systemMessage: string, userText: string) => ({
  finalState: state,
  systemMessage,
  messages: [{ role: 'user' as const, content: userText }] satisfies ModelMessage[],
  requestId: 'req-1',
  threadId: null,
});

describe('streamAgenticResponse — Modus-Wahl', () => {
  it('läuft unified, wenn der Anbieter der schnelle Werkzeug-Rufer ist', async () => {
    const { sse } = fakeSse();
    let seen: LoopEngineParams | null = null;
    await streamAgenticResponse(
      { ...baseParams(fakeState(), 'x'.repeat(4000), 'Kurze Frage?'), sse },
      fakeDeps({ provider: 'mistral', onLoop: (p) => (seen = p) })
    );
    expect(seen!.mode).toBe('unified');
  });

  it('läuft split auf jedem anderen Anbieter', async () => {
    const { sse } = fakeSse();
    let seen: LoopEngineParams | null = null;
    await streamAgenticResponse(
      { ...baseParams(fakeState(), 'x'.repeat(4000), 'Kurze Frage?'), sse },
      fakeDeps({ provider: 'greenpt', modelName: 'gemma4-31b', onLoop: (p) => (seen = p) })
    );
    expect(seen!.mode).toBe('split');
  });

  it('kippt auch auf mistral nach split, sobald der Turn seinen Stoff selbst mitbringt', async () => {
    // Der gemessene Ausfall: unified + voller Katalog im Schreibkontext + viel
    // eigener Stoff. Split ist die einzige Anordnung, in der er nie auftrat.
    const { sse } = fakeSse();
    let seen: LoopEngineParams | null = null;
    await streamAgenticResponse(
      {
        ...baseParams(fakeState(), 'kurzer Systemprompt', 'M'.repeat(12_000)),
        sse,
      },
      fakeDeps({ provider: 'mistral', onLoop: (p) => (seen = p) })
    );
    expect(seen!.mode).toBe('split');
  });
});

describe('streamAgenticResponse — Verdikt und Wiederholung', () => {
  it('reicht dem Loop ein validateAnswer, das beide Ausfallformen benennt', async () => {
    const { sse } = fakeSse();
    let seen: LoopEngineParams | null = null;
    await streamAgenticResponse(
      { ...baseParams(fakeState(), 'x'.repeat(4000), 'Frage?'), sse },
      fakeDeps({ provider: 'greenpt', onLoop: (p) => (seen = p) })
    );
    const validate = seen!.validateAnswer!;
    expect(validate('{"titel": "abgeschnitten')).toBe(SYNTH_INVALID_JSON_RETRY_SUFFIX);
    expect(validate('Der Satz hört mitten im')).toBe(SYNTH_CUTOFF_RETRY_SUFFIX);
    expect(validate('Ein vollständiger Satz.')).toBeNull();
  });

  it('ersetzt die bereits gestreamte Antwort, wenn die Wiederholung gegriffen hat', async () => {
    // `replacedStreamed` heißt: auf der Leitung liegt der VERWORFENE Durchlauf.
    // Der Turn muss die korrigierte Fassung über `completion` nachreichen und
    // die Text-Offsets fallen lassen — sie zeigen in den verworfenen Strom.
    const { sse, sent } = fakeSse();
    const outcome = await streamAgenticResponse(
      { ...baseParams(fakeState(), 'x'.repeat(4000), 'Frage?'), sse },
      fakeDeps({
        provider: 'greenpt',
        loopResult: { text: 'Die korrigierte Antwort.', replacedStreamed: true },
      })
    );
    const completion = sent.filter((e) => e.event === 'completion');
    expect(completion).toHaveLength(1);
    expect(completion[0]!.payload['text']).toBe('Die korrigierte Antwort.');
    expect(outcome.fullText).toBe('Die korrigierte Antwort.');
  });

  it('setzt eine leer gebliebene Antwort auf den Rückfall-Satz statt sie leer zu speichern', async () => {
    const { sse, sent } = fakeSse();
    const outcome = await streamAgenticResponse(
      { ...baseParams(fakeState(), 'x'.repeat(4000), 'Frage?'), sse },
      fakeDeps({ provider: 'greenpt', loopResult: { text: '   ' } })
    );
    expect(outcome.fullText).toContain('keine passende Antwort');
    expect(sent.some((e) => e.event === 'response_start')).toBe(true);
  });
});

describe('createAnswerValidator', () => {
  it('prüft die JSON-Form vor der Abschneide-Form', () => {
    // Ein abgeschnittener JSON-Block ist BEIDES. Der JSON-Hinweis ist der
    // konkretere Auftrag an den Schreiber, also muss er gewinnen.
    expect(createAnswerValidator()('{"a": 1, "b"')).toBe(SYNTH_INVALID_JSON_RETRY_SUFFIX);
  });
});

describe('assembleToolCatalog — ausgefallener MCP-Katalog', () => {
  /** Was `loadMcpCatalog` bei einem Fehler wirklich zurückgibt: leer, mit
   *  gesetztem `scopedServerMissing`. Es wirft nicht — der Turn darf davon
   *  nicht abhängen. */
  const brokenCatalog = {
    tools: {},
    labels: new Map(),
    close: async () => {},
    scopedServerMissing: true,
    scopedServerUnreachable: false,
    driftedServers: [],
    catalogSummary: '',
    promptHints: [],
  };

  const catalogDeps = (over: Partial<CatalogDeps> = {}): CatalogDeps =>
    ({
      buildChatToolCatalog: () => ({ tools: { web_search: {} }, toolNames: ['web_search'] }),
      loadMcpCatalog: async () => brokenCatalog,
      loadManagedMcpCatalog: async () => brokenCatalog,
      buildRecipeCatalog: async () => [],
      ...over,
    }) as unknown as CatalogDeps;

  it('montiert die internen Werkzeuge weiter, wenn der Dienst nichts liefert', async () => {
    const { sse } = fakeSse();
    const assembled = await assembleToolCatalog(
      {
        state: fakeState({ intent: 'mcp', agentConfig: { userId: 'u1' } } as never),
        sourceRegistry: createSourceRegistry(),
        sse,
        threadId: null,
      },
      catalogDeps()
    );
    expect(Object.keys(assembled.tools)).toContain('web_search');
    expect(assembled.mcpCatalog?.scopedServerMissing).toBe(true);
    // Kein Werkzeug des Dienstes — der Turn läuft ohne MCP weiter, statt
    // abzubrechen.
    expect(assembled.toolLabels.size).toBe(0);
  });

  it('lässt einen Turn ohne MCP-Absicht den Katalog gar nicht erst laden', async () => {
    const { sse } = fakeSse();
    const loadMcpCatalog = vi.fn(async () => brokenCatalog);
    await assembleToolCatalog(
      {
        state: fakeState({ intent: 'agentic', agentConfig: { userId: 'u1' } } as never),
        sourceRegistry: createSourceRegistry(),
        sse,
        threadId: null,
      },
      catalogDeps({ loadMcpCatalog: loadMcpCatalog as never })
    );
    expect(loadMcpCatalog).not.toHaveBeenCalled();
  });
});

describe('wrapAssembledTools — Zeitgrenze der Erstellungs-Werkzeuge', () => {
  const wrapOne = (toolName: string, execute: () => Promise<unknown>) => {
    const { sse } = fakeSse();
    const steps: PersistedStep[] = [];
    return wrapAssembledTools({ [toolName]: { execute } } as unknown as ToolSet, {
      sse,
      guards: createToolLoopGuards({
        searchToolNames: new Set(),
        getSourceCount: () => 0,
      }),
      recordStep: (s) => steps.push(s),
      perCallTimeoutMs: 20_000,
      toolLabels: new Map(),
      getTextOffset: () => null,
      takeNarration: () => null,
    });
  };

  it('gibt create_* die eigene, höhere Grenze statt der generischen', async () => {
    vi.useFakeTimers();
    try {
      let settle: (v: unknown) => void = () => {};
      const wrapped = wrapOne('create_pdf', () => new Promise((resolve) => (settle = resolve)));
      const call = (
        wrapped['create_pdf'] as { execute: (i: unknown, o: unknown) => Promise<unknown> }
      ).execute({}, { toolCallId: 'c1' });
      // Über der generischen 20s-Grenze — ein create_pdf darf hier NICHT
      // abgebrochen sein, sonst scheitert jede Erstellung an einer Grenze, die
      // sie nie einhalten konnte. Eine abgelaufene Grenze wird von wrapTools
      // zu `{ error: … }`, also ist das Fehlen dieses Feldes die Aussage.
      await vi.advanceTimersByTimeAsync(25_000);
      settle({ seiten: 3 });
      const result = (await call) as Record<string, unknown>;
      expect(result['error']).toBeUndefined();
      expect(result['seiten']).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('hält die Grenzen als Aussage über die Erstellungs-Werkzeuge zusammen', () => {
    for (const name of [
      'create_pdf',
      'create_presentation',
      'create_document',
      'create_sheet',
      'create_board',
    ]) {
      expect(TOOL_TIMEOUT_OVERRIDES_MS[name], `${name} ohne eigene Grenze`).toBeGreaterThan(20_000);
    }
  });
});
