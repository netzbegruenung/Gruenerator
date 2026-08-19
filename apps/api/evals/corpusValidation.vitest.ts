/**
 * The corpus loader's runtime validation.
 *
 * Before this existed the loader did `JSON.parse(l) as EvalCase` — a cast, not
 * a check. A misspelled expectation key therefore parsed cleanly, arrived as
 * `undefined`, and the assertion it was meant to drive silently never ran. The
 * scenario then reported green having asserted nothing, which is worse than
 * red. Every case below is a line the old loader accepted.
 */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { loadCorpus, parseCorpusText } from './corpus.js';
import { LIVE_INTENT_IDS } from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const VALID_SCENARIO = JSON.stringify({
  id: 'demo-1',
  category: 'routing',
  turns: [{ prompt: 'Hallo', expect: { routing: 'direct' } }],
});

const VALID_LEGACY = JSON.stringify({
  id: 'legacy-1',
  category: 'routing',
  prompt: 'Hallo',
  expect: { routing: 'direct' },
});

describe('parseCorpusText', () => {
  it('accepts both the scenario and the legacy single-turn shape', () => {
    const out = parseCorpusText(`${VALID_SCENARIO}\n${VALID_LEGACY}\n`, 'demo.jsonl');
    expect(out).toHaveLength(2);
    // The legacy line normalizes to exactly one turn.
    expect(out[1].turns).toHaveLength(1);
    expect(out[1].turns[0].prompt).toBe('Hallo');
  });

  it('ignores blank lines', () => {
    expect(parseCorpusText(`\n${VALID_SCENARIO}\n\n\n`, 'demo.jsonl')).toHaveLength(1);
  });

  it('rejects a misspelled expectation key and names file, line and path', () => {
    const typo = JSON.stringify({
      id: 'typo-1',
      category: 'routing',
      turns: [{ prompt: 'x', expect: { toolsMustinclude: ['web_search'] } }],
    });
    // Line 3: two good lines first, so the reported number must not be 1.
    const text = `${VALID_SCENARIO}\n${VALID_LEGACY}\n${typo}\n`;
    expect(() => parseCorpusText(text, 'demo.jsonl')).toThrow(/demo\.jsonl:3/);
    expect(() => parseCorpusText(text, 'demo.jsonl')).toThrow(/typo-1/);
    expect(() => parseCorpusText(text, 'demo.jsonl')).toThrow(/toolsMustinclude/);
  });

  it('rejects a wrongly typed expectation value', () => {
    const wrongType = JSON.stringify({
      id: 'wrong-1',
      category: 'routing',
      // A single string where a list belongs — reads fine, asserts nothing.
      turns: [{ prompt: 'x', expect: { toolsMustInclude: 'web_search' } }],
    });
    expect(() => parseCorpusText(wrongType, 'demo.jsonl')).toThrow(/toolsMustInclude/);
  });

  it('rejects an unknown surface instead of silently posting to chat', () => {
    const badSurface = JSON.stringify({
      id: 'surface-1',
      category: 'notebook',
      surface: 'notebok',
      collectionIds: ['grundsatz-system'],
      turns: [{ prompt: 'x', expect: {} }],
    });
    expect(() => parseCorpusText(badSurface, 'demo.jsonl')).toThrow(/surface/);
  });

  it('rejects a notebook scenario without a collection', () => {
    const noCollection = JSON.stringify({
      id: 'surface-2',
      category: 'notebook',
      surface: 'notebook',
      turns: [{ prompt: 'x', expect: {} }],
    });
    expect(() => parseCorpusText(noCollection, 'demo.jsonl')).toThrow(/collectionIds/);
  });

  it('accepts a well-formed notebook scenario', () => {
    const ok = JSON.stringify({
      id: 'nb-1',
      category: 'notebook',
      surface: 'notebook',
      notebookMode: 'deep',
      collectionIds: ['grundsatz-system'],
      notebookLane: true,
      turns: [{ prompt: 'x', expect: { cited: true } }],
    });
    const [scenario] = parseCorpusText(ok, 'demo.jsonl');
    expect(scenario.surface).toBe('notebook');
    expect(scenario.notebookMode).toBe('deep');
  });

  it('reports malformed JSON with its line number', () => {
    expect(() => parseCorpusText(`${VALID_SCENARIO}\n{ not json\n`, 'demo.jsonl')).toThrow(
      /demo\.jsonl:2/
    );
  });
});

describe('the checked-in corpus', () => {
  // Runs in the normal vitest lane — no backend, no network. A typo'd key in a
  // .jsonl therefore fails in CI instead of surviving as a silently-skipped
  // assertion until someone runs the live eval.
  it('validates every line of every corpus file', () => {
    const all = loadCorpus(HERE, {
      filter: '',
      slow: true,
      mcp: true,
      notebook: true,
      systemMcp: true,
      deepResearch: true,
    });
    expect(all.length).toBeGreaterThan(100);
  });

  /**
   * Ein stillgelegter Intent im Korpus ist eine Erwartung, die niemand mehr
   * erfüllen kann — der Klassifikator erzeugt ihn nicht.
   *
   * Am 19.08.2026 prüften sieben Szenarien gegen `bahn`/`wetter`/`news`/
   * `hotel`/`reise`/`umfragen`. Fachlich liefen sie richtig (`tools=[umfragen]`)
   * und meldeten trotzdem rot. Ein Prüfmittel, das für eine Stilllegung genauso
   * rot meldet wie für einen echten Werkzeug-Fehlgriff, hat aufgehört zu
   * unterscheiden. Der Loader lehnt so eine Zeile jetzt ab; dieser Test hält
   * fest, dass die abgeleitete Menge nicht leer läuft und der abgelöste Wert
   * nicht zurückkommt.
   */
  it('kennt keinen stillgelegten Intent in einer routing-Erwartung', () => {
    expect(LIVE_INTENT_IDS).toContain('agentic');
    for (const retired of ['bahn', 'reise', 'hotel', 'wetter', 'news', 'umfragen']) {
      expect(LIVE_INTENT_IDS).not.toContain(retired);
    }

    const bad = JSON.stringify({
      id: 'retired-1',
      category: 'umfragen',
      turns: [
        { prompt: 'Wie stehen die Grünen in den Umfragen?', expect: { routing: 'umfragen' } },
      ],
    });
    expect(() => parseCorpusText(bad, 'demo.jsonl')).toThrow(/routing/);
    expect(() => parseCorpusText(bad, 'demo.jsonl')).toThrow(/retired/);
  });

  it('has no duplicate scenario ids', () => {
    const all = loadCorpus(HERE, {
      filter: '',
      slow: true,
      mcp: true,
      notebook: true,
      systemMcp: true,
      deepResearch: true,
    });
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
  });
});
