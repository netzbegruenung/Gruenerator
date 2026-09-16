import { sheetOperationSchema } from '@gruenerator/contracts';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// `generateSheetOperations` calls the shared `runForcedToolCall`
// (services/ai/forcedToolCall.ts), which calls the facade's `aiTools`.
// Mocking the facade and running the real (unmocked) helper exercises that
// shared copy through the sheet planner as well as the board one — see
// services/ai/__tests__/forcedToolCall.vitest.ts for the helper's own
// retry/extraction mechanics.
const aiTools = vi.fn();
vi.mock('../../services/ai/generate.js', () => ({
  aiTools: (...args: unknown[]) => aiTools(...args),
}));

const { generateSheetOperations, normalizeRawOp, SHEET_TOOL_STRICT_PROMPT } =
  await import('./sheetAiService.js');

/**
 * normalizeRawOp coerces the `values` shape mistakes models make most often on
 * set_range_values (the op used to modify existing cells) so the op validates
 * instead of being silently dropped — which is what surfaced to users as
 * "keine Tabellen-Änderung erkannt" even though the model DID plan an edit.
 */
/**
 * Kein Prompt darf eine Operation anbieten, die er selbst verbietet.
 *
 * Genau das stand hier: die Operationsliste führte `add_chart` mit voller
 * Syntax und vier Zeilen Erklärung, und 20 Zeilen weiter stand unter RULES, dass
 * `add_chart` DEAKTIVIERT ist und nicht ausgegeben werden darf. Die
 * Implementierung in `applySheetOperations.ts` lehnt die Operation ohnehin ab —
 * ihr Kommentar behauptete sogar, der Prompt sei entsprechend angepasst.
 *
 * Entstanden ist das nicht durch Schlamperei, sondern durch eine
 * Merge-Auflösung: der Deaktivierungs-Commit nahm die Zeilen heraus, ein
 * späterer Merge holte sie zurück, und die Regel darunter blieb stehen. Ein
 * zweiter Ort, der dieselbe Achse regelt — siehe die Systemprompt-Befunde im
 * Chat-Klassifikator, dort dieselbe Ursache.
 *
 * Der Wächter ist bewusst ALLGEMEIN: er liest den fertigen Prompt, sammelt jede
 * angebotene Operation und jede als DEAKTIVIERT markierte, und verlangt, dass
 * die Mengen disjunkt sind. Ein Test nur auf `add_chart` hätte den nächsten
 * Widerspruch nicht gesehen.
 */
describe('Prompt-Konsistenz: angeboten vs. verboten', () => {
  /** `- { "type": "foo", … }` aus der Operationsliste. */
  const offered = new Set(
    [...SHEET_TOOL_STRICT_PROMPT.matchAll(/^-\s*\{\s*"type":\s*"([a-z_]+)"/gm)].map((m) => m[1])
  );
  /** Jede Zeile, die eine Operation als deaktiviert erklärt. */
  const disabled = new Set(
    SHEET_TOOL_STRICT_PROMPT.split('\n')
      .filter((line) => /DEAKTIVIERT|deaktiviert sind|nicht verfügbar/i.test(line))
      .flatMap((line) => [...line.matchAll(/\b([a-z]+_[a-z_]+)\b/g)].map((m) => m[1]))
  );

  it('findet überhaupt Operationen — sonst prüft der Wächter nichts', () => {
    // Ohne diese Zeile wäre der Test grün, sobald sich das Prompt-Format ändert
    // und die Regex ins Leere greift.
    expect(offered.size).toBeGreaterThan(5);
    expect(disabled.size).toBeGreaterThan(0);
  });

  it('bietet keine Operation an, die der Prompt selbst verbietet', () => {
    const contradictory = [...disabled].filter((op) => offered.has(op));
    expect(contradictory).toEqual([]);
  });
});

describe('normalizeRawOp', () => {
  const parse = (raw: unknown) => sheetOperationSchema.safeParse(normalizeRawOp(raw));

  it('wraps a bare scalar value into a single cell ([[x]])', () => {
    const result = parse({ type: 'set_range_values', range: 'B1', values: 2500 });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'set_range_values') {
      expect(result.data.values).toEqual([[2500]]);
    }
  });

  it('wraps a 1D row array into one row ([[...]])', () => {
    const result = parse({ type: 'set_range_values', range: 'A1:C1', values: ['a', 'b', 'c'] });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'set_range_values') {
      expect(result.data.values).toEqual([['a', 'b', 'c']]);
    }
  });

  it('leaves a well-shaped 2D array untouched', () => {
    const values = [
      ['a', 'b'],
      ['c', 'd'],
    ];
    const result = parse({ type: 'set_range_values', range: 'A1:B2', values });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'set_range_values') {
      expect(result.data.values).toEqual(values);
    }
  });

  it('leaves a single-column 2D array untouched', () => {
    const values = [['a'], ['b'], ['c']];
    const result = parse({ type: 'set_range_values', range: 'A1:A3', values });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'set_range_values') {
      expect(result.data.values).toEqual(values);
    }
  });

  it('does not touch other operation types', () => {
    const formulaOp = { type: 'set_formula', cell: 'D2', formula: '=SUM(A1:A10)' };
    expect(normalizeRawOp(formulaOp)).toBe(formulaOp);
    const clearOp = { type: 'clear_range', range: 'B2:B5' };
    expect(normalizeRawOp(clearOp)).toBe(clearOp);
  });

  it('passes non-objects through untouched', () => {
    expect(normalizeRawOp(null)).toBe(null);
    expect(normalizeRawOp('nonsense')).toBe('nonsense');
    expect(normalizeRawOp(42)).toBe(42);
  });
});

describe('Phase 0 operation schema', () => {
  it('validates set_number_format', () => {
    const r = sheetOperationSchema.safeParse({
      type: 'set_number_format',
      range: 'B2:B20',
      pattern: '#,##0.00\\ [$€-407]',
    });
    expect(r.success).toBe(true);
  });

  it('validates set_range_values with asText (force-text)', () => {
    const r = sheetOperationSchema.safeParse({
      type: 'set_range_values',
      range: 'A2:A5',
      values: [['00123'], ['2-2']],
      asText: true,
    });
    expect(r.success).toBe(true);
  });

  it('normalizeRawOp leaves set_number_format untouched', () => {
    const op = { type: 'set_number_format', range: 'B2', pattern: '0%' };
    expect(normalizeRawOp(op)).toBe(op);
  });
});

describe('add_chart operation schema', () => {
  it('validates each chart type', () => {
    for (const chartType of ['bar', 'line', 'area', 'pie', 'donut']) {
      expect(
        sheetOperationSchema.safeParse({ type: 'add_chart', range: 'A1:D5', chartType }).success
      ).toBe(true);
    }
  });

  it('rejects an unknown chart type', () => {
    expect(
      sheetOperationSchema.safeParse({ type: 'add_chart', range: 'A1:D5', chartType: 'radar' })
        .success
    ).toBe(false);
  });
});

describe('Phase 1 structural operation schema', () => {
  it('validates insert_rows / delete_rows (1-based row + count)', () => {
    expect(sheetOperationSchema.safeParse({ type: 'insert_rows', at: 5, count: 2 }).success).toBe(
      true
    );
    expect(sheetOperationSchema.safeParse({ type: 'delete_rows', at: 3, count: 1 }).success).toBe(
      true
    );
  });

  it('rejects non-positive row targets/counts', () => {
    expect(sheetOperationSchema.safeParse({ type: 'insert_rows', at: 0, count: 2 }).success).toBe(
      false
    );
    expect(sheetOperationSchema.safeParse({ type: 'delete_rows', at: 3, count: 0 }).success).toBe(
      false
    );
  });

  it('validates insert_columns / delete_columns (column letter + count)', () => {
    expect(
      sheetOperationSchema.safeParse({ type: 'insert_columns', at: 'C', count: 1 }).success
    ).toBe(true);
    expect(
      sheetOperationSchema.safeParse({ type: 'delete_columns', at: 'AA', count: 2 }).success
    ).toBe(true);
  });

  it('validates merge_cells / unmerge_cells', () => {
    expect(sheetOperationSchema.safeParse({ type: 'merge_cells', range: 'A1:C1' }).success).toBe(
      true
    );
    expect(sheetOperationSchema.safeParse({ type: 'unmerge_cells', range: 'A1:C1' }).success).toBe(
      true
    );
  });
});

/** A tool-call-shaped `AiResult` for `applySheetOperations`. */
function toolCallResult(operations: unknown[]) {
  return {
    success: true,
    content: null,
    stop_reason: 'tool_use',
    tool_calls: [{ name: 'applySheetOperations', input: { operations } }],
  };
}

describe('generateSheetOperations', () => {
  beforeEach(() => {
    aiTools.mockReset();
  });

  it('returns validated ops on the happy path', async () => {
    aiTools.mockResolvedValueOnce(
      toolCallResult([{ type: 'set_range_values', range: 'B1', values: [[2500]] }])
    );

    const ops = await generateSheetOperations({
      userPrompt: 'ändere B1 auf 2500',
      sheetContext: 'A1: Umsatz, B1: 1000',
    });

    expect(ops).toEqual([{ type: 'set_range_values', range: 'B1', values: [[2500]] }]);
    const call = aiTools.mock.calls[0][0] as { lane: string; tools: Array<{ name: string }> };
    expect(call.lane).toBe('editor_ops_sheet');
    expect(call.tools[0].name).toBe('applySheetOperations');
  });

  it('drops an invalid op and keeps the valid ones (per-op leniency)', async () => {
    aiTools.mockResolvedValueOnce(
      toolCallResult([
        { type: 'set_range_values', range: 'B1', values: [[2500]] },
        // Missing "range" — invalid set_number_format, dropped, not fatal.
        { type: 'set_number_format', pattern: '0%' },
      ])
    );

    const ops = await generateSheetOperations({
      userPrompt: 'ändere B1 und formatiere etwas',
      sheetContext: 'A1: Umsatz, B1: 1000',
    });

    expect(ops).toEqual([{ type: 'set_range_values', range: 'B1', values: [[2500]] }]);
  });
});
