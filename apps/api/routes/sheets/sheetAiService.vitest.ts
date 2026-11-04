import { sheetOperationSchema } from '@gruenerator/contracts';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// `generateSheetOperations` calls the facade's `aiObject`. The fake below plays
// its contract — one scripted tool input per attempt, each run through the
// planner's own `validate`, the next attempt only after a rejection — so these
// tests pin the planner's gate. The repair turn itself is tested with aiObject
// in services/ai/__tests__.
type Call = {
  lane: string;
  toolName: string;
  attempts?: number;
  validate: (
    input: unknown,
    attempt: number,
    attempts: number
  ) => { ok: true; value: unknown } | { ok: false; error: string };
};
const scripted: unknown[] = [];
const rejections: string[] = [];
const aiObject = vi.fn(async (call: Call) => {
  const attempts = call.attempts ?? 2;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const v = call.validate(scripted[attempt - 1], attempt, attempts);
    if (v.ok) return { ok: true, data: v.value };
    rejections.push(v.error);
  }
  return { ok: false, error: rejections.at(-1) ?? '' };
});
vi.mock('../../services/ai/generate.js', () => ({
  aiObject: (call: Call) => aiObject(call),
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

  // Schema und Prompt sind zwei Listen derselben Menge: eine Operation nur im
  // Schema plant das Modell nie, eine nur im Prompt fällt bei der Validierung weg.
  it('bietet genau die Operationen des Schemas an (außer den deaktivierten)', () => {
    const inSchema = sheetOperationSchema.options
      .map((o) => o.shape.type.value)
      .filter((type) => !disabled.has(type));
    expect([...offered].sort()).toEqual([...inSchema].sort());
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

describe('generateSheetOperations', () => {
  beforeEach(() => {
    aiObject.mockClear();
    scripted.length = 0;
    rejections.length = 0;
  });

  it('returns validated ops on the happy path', async () => {
    scripted.push({ operations: [{ type: 'set_range_values', range: 'B1', values: [[2500]] }] });

    const ops = await generateSheetOperations({
      userPrompt: 'ändere B1 auf 2500',
      sheetContext: 'A1: Umsatz, B1: 1000',
    });

    expect(ops).toEqual([{ type: 'set_range_values', range: 'B1', values: [[2500]] }]);
    const call = aiObject.mock.calls[0][0];
    expect(call.lane).toBe('editor_ops_sheet');
    expect(call.toolName).toBe('applySheetOperations');
  });

  it('sends a malformed op back for repair, naming the field (#4470)', async () => {
    scripted.push(
      { operations: [{ type: 'set_number_format', pattern: '0%' }] },
      { operations: [{ type: 'set_number_format', range: 'B2:B9', pattern: '0%' }] }
    );

    const ops = await generateSheetOperations({
      userPrompt: 'formatiere Spalte B als Prozent',
      sheetContext: 'A1: Umsatz, B1: 1000',
    });

    expect(rejections).toHaveLength(1);
    expect(rejections[0]).toContain('Operation 1: range:');
    expect(ops).toEqual([{ type: 'set_number_format', range: 'B2:B9', pattern: '0%' }]);
  });

  it('keeps the valid ops on the last attempt (per-op leniency)', async () => {
    const batch = {
      operations: [
        { type: 'set_range_values', range: 'B1', values: [[2500]] },
        // Missing "range" — still invalid after the repair turn.
        { type: 'set_number_format', pattern: '0%' },
      ],
    };
    scripted.push(batch, batch);

    const ops = await generateSheetOperations({
      userPrompt: 'ändere B1 und formatiere etwas',
      sheetContext: 'A1: Umsatz, B1: 1000',
    });

    expect(ops).toEqual([{ type: 'set_range_values', range: 'B1', values: [[2500]] }]);
  });

  it('accepts format_range fields nested under the op name without a repair turn', async () => {
    // The exact op the cortecs fallback sent in #4470.
    scripted.push({
      operations: [
        {
          background: '#46962b',
          bold: true,
          fontColor: '#ffffff',
          format_range: { range: 'A1:C1' },
          type: 'format_range',
        },
      ],
    });

    const ops = await generateSheetOperations({
      userPrompt: 'Mach die Kopfzeile in der Tabelle fett und grün hinterlegt',
      sheetContext: 'A1: Name, B1: Ort, C1: Datum',
    });

    expect(rejections).toHaveLength(0);
    expect(ops).toEqual([
      {
        type: 'format_range',
        range: 'A1:C1',
        bold: true,
        background: '#46962b',
        fontColor: '#ffffff',
      },
    ]);
  });

  it('returns no ops when no attempt produced a usable tool call', async () => {
    const ops = await generateSheetOperations({ userPrompt: 'x', sheetContext: '' });
    expect(ops).toEqual([]);
  });

  it('rethrows a provider failure', async () => {
    const cause = new Error('provider chain spent');
    aiObject.mockResolvedValueOnce({ ok: false, error: 'x', cause } as never);
    await expect(generateSheetOperations({ userPrompt: 'x', sheetContext: '' })).rejects.toBe(
      cause
    );
  });
});
