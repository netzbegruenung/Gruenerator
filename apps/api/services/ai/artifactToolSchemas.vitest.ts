/**
 * The wire schemas shown to the model for the forced tool call.
 *
 * Two invariants, and they pull in opposite directions:
 *
 *  1. LOOSE ENOUGH for the provider. Strict json_schema modes reject `default`,
 *     and gpt-oss (verdigado-pro via LiteLLM) / Mistral handle deep `anyOf`
 *     badly — which is why these are hand-written instead of
 *     zodToJsonSchema(pdfDocumentSchema), whose 11-member discriminated union
 *     plus nested string|object union would produce exactly that.
 *
 *  2. STRICT ENOUGH to name the fields whose absence actually broke things:
 *     PDF without `blocks`, board without `statusOptions` (a TypeError deep in
 *     post-processing), document without `content` (a blank artifact reported
 *     as a success).
 *
 * The real validation stays in the parsers/Zod behind them — these only steer
 * the model.
 */

import { describe, expect, it, vi } from 'vitest';

import { PDF_DOCUMENT_TOOL_SCHEMA, pdfDocumentSchema } from '../pdf/pdfDocument.js';

vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({}),
}));

const { SHEET_TOOL_SCHEMA } = await import('../sheets/SheetGenerationService.js');
const { PRESENTATION_TOOL_SCHEMA } =
  await import('../presentations/PresentationGenerationService.js');
const { BOARD_TOOL_SCHEMA } = await import('../boards/BoardService.js');
const { DOCUMENT_TOOL_SCHEMA } = await import('../docs/DocGenerationService.js');

interface JsonSchema {
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: unknown[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

const ALL_SCHEMAS: Array<[string, JsonSchema]> = [
  ['pdf', PDF_DOCUMENT_TOOL_SCHEMA as JsonSchema],
  ['sheet', SHEET_TOOL_SCHEMA as JsonSchema],
  ['presentation', PRESENTATION_TOOL_SCHEMA as JsonSchema],
  ['board', BOARD_TOOL_SCHEMA as JsonSchema],
  ['document', DOCUMENT_TOOL_SCHEMA as JsonSchema],
];

/** Walk every nested schema node. */
function walk(node: JsonSchema, visit: (n: JsonSchema) => void): void {
  visit(node);
  for (const child of Object.values(node.properties ?? {})) walk(child, visit);
  if (node.items) walk(node.items, visit);
}

describe.each(ALL_SCHEMAS)('%s tool schema', (_name, schema) => {
  it('is an object schema with required fields', () => {
    expect(schema.type).toBe('object');
    expect(schema.required?.length).toBeGreaterThan(0);
  });

  it('declares every required field as a property', () => {
    for (const field of schema.required ?? []) {
      expect(Object.keys(schema.properties ?? {})).toContain(field);
    }
  });

  it('uses no default/anyOf/oneOf that strict provider modes reject', () => {
    walk(schema, (node) => {
      expect(node.default).toBeUndefined();
      expect(node.anyOf).toBeUndefined();
      expect(node.oneOf).toBeUndefined();
      expect(node.$ref).toBeUndefined();
    });
  });

  it('stays permissive so extra model output is not a hard failure', () => {
    expect(schema.additionalProperties).toBe(true);
  });
});

describe('the fields whose absence caused real failures are required', () => {
  it('pdf requires title and blocks', () => {
    expect(PDF_DOCUMENT_TOOL_SCHEMA.required).toEqual(['title', 'blocks']);
  });

  it('board requires statusOptions and rows (post-processing dereferences both)', () => {
    expect(BOARD_TOOL_SCHEMA.required).toContain('statusOptions');
    expect(BOARD_TOOL_SCHEMA.required).toContain('rows');
  });

  it('document requires non-empty content', () => {
    expect(DOCUMENT_TOOL_SCHEMA.required).toContain('content');
    const content = (DOCUMENT_TOOL_SCHEMA.properties as Record<string, JsonSchema>).content;
    expect(content.minLength).toBe(1);
  });

  it('sheet requires columns per sheet, so half-tables stop at the model', () => {
    const sheets = (SHEET_TOOL_SCHEMA.properties as Record<string, JsonSchema>).sheets;
    expect(sheets.items?.required).toContain('columns');
  });
});

describe('the loose pdf wire schema still feeds the strict Zod gate', () => {
  it('a document shaped by the wire schema passes pdfDocumentSchema', () => {
    // Minimal output an obedient model would produce from the wire schema.
    const fromModel = {
      title: 'Fact Sheet – Wirtschaftswachstum',
      blocks: [
        { type: 'heading', level: 2, text: 'Prognosen 2026' },
        { type: 'paragraph', text: 'Das reale BIP-Wachstum liegt zwischen 0,6 % und 1,5 %.' },
        {
          type: 'table',
          columns: ['Quelle', 'Wachstum'],
          rows: [
            ['OeNB', '0,6 %'],
            ['FinanzInfo', '1,5 %'],
          ],
        },
      ],
    };

    expect(pdfDocumentSchema.safeParse(fromModel).success).toBe(true);
  });

  it('rejects at the gate what the wire schema alone would let through', () => {
    // additionalProperties:true means the wire schema tolerates this; the Zod
    // gate is what still says no.
    expect(pdfDocumentSchema.safeParse({ title: 'Ohne Blöcke', blocks: [] }).success).toBe(false);
    expect(pdfDocumentSchema.safeParse({ blocks: [{ type: 'divider' }] }).success).toBe(false);
  });

  it('names the missing field, so the repair turn can act on it', () => {
    const parsed = pdfDocumentSchema.safeParse({ title: 'Nur Titel' });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((i) => i.path.join('.'))).toContain('blocks');
    }
  });
});
