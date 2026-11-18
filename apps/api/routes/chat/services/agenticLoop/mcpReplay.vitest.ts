import { describe, it, expect } from 'vitest';

import {
  actionDigest,
  buildToolObservationReplay,
  REPLAY_BRIDGE_TEXT,
  spliceToolReplay,
} from './mcpReplay.js';
import { toolResultBudget } from './toolResultBudgets.js';
import { DEFAULT_MAX_RESULT_CHARS, resultForModel } from './wrapTools.js';

import type { PersistedStep } from './types.js';
import type { ModelMessage } from 'ai';

function mcpStep(over: Partial<PersistedStep> = {}): PersistedStep {
  return {
    toolCallId: 'c1',
    toolName: 'ma__search',
    args: { q: 'klima' },
    result: { content: 'Treffer' },
    serverName: 'Notion',
    ...over,
  };
}

/** A step of an internal (non-MCP) tool: no `serverName` at all. */
function internalStep(over: Partial<PersistedStep> = {}): PersistedStep {
  const { serverName: _mcpOnly, ...step } = mcpStep(over);
  return step;
}

const catalog = new Set(['ma__search', 'mb__send', 'gruenerator_search', 'bundestag']);

describe('buildToolObservationReplay', () => {
  it('reconstructs a valid assistant tool-call + tool-result pair', () => {
    const msgs = buildToolObservationReplay([mcpStep()], catalog);
    expect(msgs).toHaveLength(2);
    const [assistant, tool] = msgs;
    expect(assistant.role).toBe('assistant');
    expect(tool.role).toBe('tool');
    const call = (assistant.content as Array<Record<string, unknown>>)[0];
    const res = (tool.content as Array<Record<string, unknown>>)[0];
    expect(call).toMatchObject({ type: 'tool-call', toolCallId: 'c1', toolName: 'ma__search' });
    expect(res).toMatchObject({ type: 'tool-result', toolCallId: 'c1', toolName: 'ma__search' });
    // every tool-result pairs with a preceding tool-call of the same id
    expect((res as { toolCallId: string }).toolCallId).toBe(
      (call as { toolCallId: string }).toolCallId
    );
  });

  it('replays internal (non-MCP) steps too — no serverName required', () => {
    const internal = internalStep({ toolName: 'gruenerator_search' });
    const msgs = buildToolObservationReplay([internal], catalog);
    expect(msgs).toHaveLength(2);
    const call = (msgs[0].content as Array<{ toolName: string }>)[0];
    expect(call.toolName).toBe('gruenerator_search');
  });

  it('never leaks a step narration into the replayed model messages', () => {
    // Split-mode turns (#5441) persisted a UI-only `narration`; old rows still
    // carry it, and the model must not see it in cross-turn observations.
    const withNarration = {
      ...mcpStep(),
      narration: 'Ich suche jetzt nach Klima-Beschlüssen.',
    } as PersistedStep;
    const serialized = JSON.stringify(buildToolObservationReplay([withNarration], catalog));
    expect(serialized).not.toContain('Ich suche jetzt');
    expect(serialized).not.toContain('narration');
  });

  it('replays a domain retrieval step (bundestag)', () => {
    const step = internalStep({ toolName: 'bundestag', toolCallId: 'b1' });
    const msgs = buildToolObservationReplay([step], catalog);
    expect(msgs).toHaveLength(2);
  });

  it('validity gate: drops steps whose tool is not in the current catalog', () => {
    const gone = mcpStep({ toolName: 'mz__deleted' });
    expect(buildToolObservationReplay([gone], catalog)).toEqual([]);
  });

  it('dedups repeated tool call ids', () => {
    const msgs = buildToolObservationReplay([mcpStep(), mcpStep()], catalog);
    expect((msgs[0].content as unknown[]).length).toBe(1);
  });

  it('caps to the most recent maxSteps (oldest dropped)', () => {
    const steps = Array.from({ length: 5 }, (_, i) =>
      mcpStep({ toolCallId: `c${i}`, args: { i } })
    );
    const msgs = buildToolObservationReplay(steps, catalog, { maxSteps: 2 });
    const ids = (msgs[0].content as Array<{ toolCallId: string }>).map((c) => c.toolCallId);
    expect(ids).toEqual(['c3', 'c4']);
  });

  it('empty input → [] (loop history unchanged)', () => {
    expect(buildToolObservationReplay([], catalog)).toEqual([]);
  });

  it('truncates a huge result value', () => {
    const big = mcpStep({ result: { content: 'x'.repeat(2000) } });
    const msgs = buildToolObservationReplay([big], catalog);
    const out = (msgs[1].content as Array<{ output: { value: string } }>)[0].output.value;
    expect(out.length).toBeLessThan(600);
    expect(out.endsWith('…')).toBe(true);
  });

  it('strips embedded [N] citation markers so the current turn owns the namespace', () => {
    // A replayed search result carries its own numbered source block.
    const step = internalStep({
      toolName: 'gruenerator_search',
      result: { sources: '[1] Wahlprogramm — SPD stimmte zu [2] Rede von X' },
    });
    const msgs = buildToolObservationReplay([step], catalog);
    const out = (msgs[1].content as Array<{ output: { value: string } }>)[0].output.value;
    expect(out).not.toMatch(/\[\d+\]/);
    // the surrounding text survives, only the markers are gone
    expect(out).toContain('Wahlprogramm');
  });
  it('never leaks rerankDegraded into a replayed tool-result, but keeps the rest', () => {
    // The persisted step is intentionally raw (card + debugging) — the strip
    // must happen here, at replay serialization, not before recordStep.
    const degraded = internalStep({
      toolName: 'gruenerator_search',
      result: { results: [{ title: 'Klimaschutz' }], rerankDegraded: true },
    });
    const msgs = buildToolObservationReplay([degraded], catalog);
    const out = (msgs[1].content as Array<{ output: { value: string } }>)[0].output.value;
    expect(out).not.toContain('rerankDegraded');
    expect(out).toContain('Klimaschutz');
  });

  it('never leaks the uiCard payload of the Bundestag cards into a replay', () => {
    const step = internalStep({
      toolName: 'bundestag',
      result: { resultCount: 1, sources: 'Treffer', uiCard: { dokumente: [{ titel: 'GEHEIM' }] } },
    });
    const msgs = buildToolObservationReplay([step], catalog);
    const out = (msgs[1].content as Array<{ output: { value: string } }>)[0].output.value;
    expect(out).not.toContain('uiCard');
    expect(out).not.toContain('GEHEIM');
  });

  it('gives a knowledge result the same replay budget as a source block', () => {
    // `product_knowledge` registers no sources, so it fell into the 500-char
    // action preview: live on 03.08.2026 its replay was cut from 3.876 to 500
    // characters, and the next turn described the product from an eighth of
    // what it had just been told.
    const step = internalStep({
      toolName: 'gruenerator_search',
      result: { knowledge: 'K'.repeat(3800) },
    });
    const msgs = buildToolObservationReplay([step], catalog);
    const out = (msgs[1].content as Array<{ output: { value: string } }>)[0].output.value;
    expect(out.length).toBeGreaterThan(3000);
  });

  it('gives a result with compact refs the reference budget, a bare row list only the preview', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      title: `Quelle ${i}`,
      url: `https://gruene.berlin/${i}`,
      ref: `https://gruene.berlin/${i}`,
    }));
    const withRefs = internalStep({
      toolName: 'gruenerator_search',
      result: { refs: rows.map((r) => `${r.title} — ${r.ref}`).join('\n'), results: rows },
    });
    const bare = internalStep({
      toolCallId: 'c2',
      toolName: 'gruenerator_search',
      result: { results: rows },
    });
    const msgs = buildToolObservationReplay([withRefs, bare], catalog);
    const [refsOut, bareOut] = (msgs[1].content as Array<{ output: { value: string } }>).map(
      (c) => c.output.value
    );
    for (const r of rows) expect(refsOut).toContain(r.ref);
    // Die Zeilen selbst bleiben zurück — refs ist ihre kurze Form.
    expect(refsOut).not.toContain('"results"');
    expect(bareOut!.length).toBeLessThanOrEqual(501);
  });

  describe('sameTurn (resume of a paused turn, #3795)', () => {
    // The shape of a 15-row `notebooks` list: bare rows, ~4.6k chars.
    const notebookRows = Array.from({ length: 15 }, (_, i) => ({
      id: `nb-${i}`,
      name: `Notebook Pressemitteilungen Landesverband ${i}`,
      description: 'Sammlung aller Pressemitteilungen und Positionspapiere '.repeat(4),
    }));
    const listStep = internalStep({
      toolName: 'gruenerator_search',
      result: { scope: 'all', resultCount: 15, results: notebookRows },
    });
    const valueOf = (msgs: ModelMessage[]) =>
      (msgs[1].content as Array<{ output: { value: string } }>).map((c) => c.output.value);

    it('replays the list the loop just saw in full, where the cross-turn preview cuts it', () => {
      const [crossTurn] = valueOf(buildToolObservationReplay([listStep], catalog));
      const [sameTurn] = valueOf(
        buildToolObservationReplay([listStep], catalog, { sameTurn: true })
      );
      expect(crossTurn!.length).toBeLessThanOrEqual(501);
      expect(JSON.stringify(listStep.result).length).toBeGreaterThan(4000);
      expect(JSON.parse(sameTurn!)).toEqual(listStep.result);
    });

    it('keeps every step of the paused turn, not only the most recent six', () => {
      const steps = Array.from({ length: 9 }, (_, i) => mcpStep({ toolCallId: `s${i}` }));
      expect(valueOf(buildToolObservationReplay(steps, catalog))).toHaveLength(6);
      expect(valueOf(buildToolObservationReplay(steps, catalog, { sameTurn: true }))).toHaveLength(
        9
      );
    });

    it('shapes an oversized result exactly as the loop did before the pause', () => {
      const huge = mcpStep({ result: { content: 'x'.repeat(DEFAULT_MAX_RESULT_CHARS * 2) } });
      const [value] = valueOf(buildToolObservationReplay([huge], catalog, { sameTurn: true }));
      expect(JSON.parse(value!)).toEqual(resultForModel(huge.result, DEFAULT_MAX_RESULT_CHARS));
    });

    it('gives a tool with its own budget the same room after the pause (read_document, 20k)', () => {
      const inhalt = 'Absatz zur Wärmewende in der Kommune.\n\n'.repeat(600).slice(0, 20_000);
      const doc = internalStep({
        toolName: 'read_document',
        result: { documentId: 'd1', inhalt },
      });
      const names = new Set(['read_document']);
      const [value] = valueOf(
        buildToolObservationReplay([doc], names, {
          sameTurn: true,
          resultBudgetFor: (name) => toolResultBudget(name, new Map()),
        })
      );
      expect((JSON.parse(value!) as { inhalt: string }).inhalt).toBe(inhalt);
    });
  });
});

describe('spliceToolReplay', () => {
  const history: ModelMessage[] = [
    { role: 'user', content: 'was steht im wahlprogramm?' },
    { role: 'assistant', content: 'Dazu habe ich gesucht.' },
    { role: 'user', content: 'und morgen?' },
  ];
  const replay = buildToolObservationReplay([mcpStep()], catalog);

  it('puts the calls in front of the answer they produced', () => {
    // Time order like Open WebUI/LobeHub/LibreChat; after the answer the model
    // read the block as a lookup it had just made (09.11.2026).
    const out = spliceToolReplay(history, replay);
    expect(out).toEqual([history[0], ...replay, history[1], history[2]]);
    expect(out.some((m) => m.content === REPLAY_BRIDGE_TEXT)).toBe(false);
  });

  it('never lets a user message follow a tool message', () => {
    // mistral-common (GreenPT, Mistral API) rejects that transition with 400.
    for (const h of [history, [history[2]]]) {
      const roles = spliceToolReplay(h, replay).map((m) => m.role);
      for (let i = 1; i < roles.length; i++) {
        expect(`${roles[i - 1]}→${roles[i]}`).not.toBe('tool→user');
      }
    }
  });

  it('keeps the current user message last and the replay pair adjacent', () => {
    const out = spliceToolReplay(history, replay);
    expect(out[out.length - 1]).toBe(history[history.length - 1]);
    expect(out.indexOf(replay[1])).toBe(out.indexOf(replay[0]) + 1);
  });

  it('falls back to a bridged block before the question without an earlier answer', () => {
    const only: ModelMessage[] = [{ role: 'user', content: 'und morgen?' }];
    expect(spliceToolReplay(only, replay).map((m) => m.role)).toEqual([
      'assistant',
      'tool',
      'assistant',
      'user',
    ]);
  });

  it('adds no bridge when the last message is not a user message', () => {
    const ending: ModelMessage[] = [{ role: 'assistant', content: 'weiter' }];
    expect(spliceToolReplay(ending, replay)).toEqual([...replay, ending[0]]);
  });

  it('passes the history through untouched when there is no replay', () => {
    expect(spliceToolReplay(history, [])).toEqual(history);
    expect(spliceToolReplay([], replay)).toEqual([]);
  });
});

describe('actionDigest', () => {
  const sharepic = (over: Partial<PersistedStep> = {}): PersistedStep =>
    internalStep({
      toolName: 'edit_sharepic',
      result: {
        summary: 'Headline gekürzt',
        variants: [{ initialProps: { img: 'data:image/png;base64,AAAA' } }],
      },
      ...over,
    });

  it('keeps ok and summary, drops variants', () => {
    expect(actionDigest(sharepic())).toBe('{"ok":true,"summary":"Headline gekürzt"}');
  });

  it('reports a failed step with its error', () => {
    const out = actionDigest(sharepic({ ok: false, result: { error: 'kein Zugriff' } }));
    expect(out).toContain('"ok":false');
    expect(out).toContain('kein Zugriff');
  });

  it('reports a step that carries an error as failed, even without ok:false', () => {
    // Forced steps are persisted without `ok`, so the error alone has to decide.
    const out = actionDigest(
      internalStep({ toolName: 'sharepic', result: { error: 'Zeitüberschreitung' } })
    );
    expect(out).toContain('"ok":false');
  });

  it('marks an unchanged result', () => {
    expect(actionDigest(sharepic({ result: { unchanged: true } }))).toContain('"unchanged":true');
  });

  it('reads the outcome the editor tools store under note', () => {
    const out = actionDigest(
      internalStep({ toolName: 'edit_document_text', result: { note: 'Absatz 2 förmlicher' } })
    );
    expect(out).toBe('{"ok":true,"summary":"Absatz 2 förmlicher"}');
  });

  it('names the document create_document produced', () => {
    const out = actionDigest(
      internalStep({
        toolName: 'create_document',
        result: { document: { documentId: 'd1', title: 'Pressemitteilung Radweg' } },
      })
    );
    expect(out).toBe('{"ok":true,"summary":"Dokument erstellt: Pressemitteilung Radweg"}');
  });

  it('stays within 300 chars for a 2000-char summary', () => {
    const out = actionDigest(sharepic({ result: { summary: 'x'.repeat(2000) } }));
    expect(out.length).toBeLessThanOrEqual(300);
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('is used by the replay for action tools, shortValue stays for the rest', () => {
    const names = new Set(['edit_image', 'edit_sharepic', 'create_document', 'web_search']);
    const steps = ['edit_image', 'edit_sharepic', 'create_document', 'web_search'].map(
      (toolName, i) =>
        internalStep({
          toolCallId: `a${i}`,
          toolName,
          result: { summary: 'erledigt', variants: ['V'], content: 'Treffer' },
        })
    );
    const msgs = buildToolObservationReplay(steps, names);
    const out = (msgs[1].content as Array<{ output: { value: string } }>).map(
      (r) => r.output.value
    );
    for (const v of out.slice(0, 3)) expect(v).toBe('{"ok":true,"summary":"erledigt"}');
    expect(out[3]).toContain('"content":"Treffer"');
    expect(out[3]).toContain('variants');
  });
});
