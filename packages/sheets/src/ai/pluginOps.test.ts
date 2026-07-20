import { sheetOperationSchema } from '@gruenerator/contracts';
import { describe, it, expect } from 'vitest';

// Round-trip guard for the plugin-backed ops (conditional formatting, data
// validation, sort, filter, table). applySheetOperations' `never` default
// already enforces exhaustive HANDLING at compile time; this pins the WIRE
// SHAPES (enums, nested discriminated unions) the planner is told to emit.

describe('plugin-backed sheet operation schemas', () => {
  it('accepts add_conditional_format cell_number for every operator', () => {
    for (const operator of [
      'greater_than',
      'greater_equal',
      'less_than',
      'less_equal',
      'equal',
      'not_equal',
      'between',
      'not_between',
    ] as const) {
      const op = {
        type: 'add_conditional_format',
        range: 'B2:B20',
        rule: { kind: 'cell_number', operator, value: 100, value2: 200, background: '#ffcdd2' },
      };
      expect(sheetOperationSchema.safeParse(op).success, operator).toBe(true);
    }
  });

  it('accepts add_conditional_format text_contains', () => {
    const op = {
      type: 'add_conditional_format',
      range: 'A2:A50',
      rule: { kind: 'text_contains', text: 'offen', background: '#fff9c4', bold: true },
    };
    expect(sheetOperationSchema.safeParse(op).success).toBe(true);
  });

  it('rejects an unknown conditional-format rule kind', () => {
    const op = {
      type: 'add_conditional_format',
      range: 'B2:B20',
      rule: { kind: 'color_scale', min: '#fff', max: '#000' },
    };
    expect(sheetOperationSchema.safeParse(op).success).toBe(false);
  });

  it('accepts all set_data_validation rule kinds', () => {
    const rules = [
      { kind: 'list', values: ['Ja', 'Nein'], multiple: false },
      { kind: 'checkbox' },
      { kind: 'number', operator: 'between', value: 0, value2: 100 },
      { kind: 'date', operator: 'on_or_after', date: '2026-01-01' },
    ];
    for (const rule of rules) {
      const op = { type: 'set_data_validation', range: 'C2:C50', rule };
      expect(sheetOperationSchema.safeParse(op).success, rule.kind).toBe(true);
    }
  });

  it('rejects an empty data-validation list', () => {
    const op = { type: 'set_data_validation', range: 'C2:C50', rule: { kind: 'list', values: [] } };
    expect(sheetOperationSchema.safeParse(op).success).toBe(false);
  });

  it('accepts sort_range, create_filter, add_table', () => {
    expect(
      sheetOperationSchema.safeParse({
        type: 'sort_range',
        range: 'A1:D20',
        column: 'B',
        ascending: true,
      }).success
    ).toBe(true);
    expect(
      sheetOperationSchema.safeParse({ type: 'create_filter', range: 'A1:E30' }).success
    ).toBe(true);
    expect(
      sheetOperationSchema.safeParse({ type: 'add_table', range: 'A1:E30', name: 'Umsätze' }).success
    ).toBe(true);
  });

  it('requires sort_range to carry column + ascending', () => {
    expect(sheetOperationSchema.safeParse({ type: 'sort_range', range: 'A1:D20' }).success).toBe(
      false
    );
  });
});
