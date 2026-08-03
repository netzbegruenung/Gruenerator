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

import {
  PDF_DOCUMENT_TOOL_SCHEMA,
  pdfDocumentFromModelSchema,
  pdfDocumentSchema,
} from '../pdf/pdfDocument.js';

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

/**
 * Every block type with every optional field filled, plus the list of fields a
 * model may legitimately leave out.
 *
 * Extend this when a block type or an optional field is added — that is the
 * point: the null case below is derived from it, so a new optional field is
 * covered without anyone remembering to write a test for it.
 */
const BLOCK_CASES: Array<{ kind: string; block: Record<string, unknown>; optional: string[] }> = [
  { kind: 'heading', block: { type: 'heading', level: 2, text: 'Maßnahmen' }, optional: ['level'] },
  { kind: 'paragraph', block: { type: 'paragraph', text: 'Fließtext.' }, optional: [] },
  {
    kind: 'list',
    block: { type: 'list', ordered: true, items: ['Erstens', 'Zweitens'] },
    optional: ['ordered'],
  },
  {
    kind: 'table',
    block: {
      type: 'table',
      columns: ['Nr.', 'Quelle'],
      rows: [['1', 'Bundestag']],
      caption: 'Quellen',
    },
    optional: ['caption'],
  },
  {
    kind: 'quote',
    block: { type: 'quote', text: 'Zitat.', source: 'Plenarprotokoll' },
    optional: ['source'],
  },
  { kind: 'note', block: { type: 'note', title: 'Hinweis', text: 'Kasten.' }, optional: ['title'] },
  {
    kind: 'keyvalue',
    block: { type: 'keyvalue', entries: [{ label: 'Datum', value: '01.03.2026' }] },
    optional: [],
  },
  { kind: 'divider', block: { type: 'divider' }, optional: [] },
  { kind: 'pagebreak', block: { type: 'pagebreak' }, optional: [] },
  {
    kind: 'field (multiline)',
    block: {
      type: 'field',
      kind: 'multiline',
      label: 'Begründung',
      name: 'begruendung',
      lines: 6,
      required: true,
      help: 'Kurz halten.',
      width: 'full',
    },
    optional: ['kind', 'name', 'lines', 'required', 'help', 'width'],
  },
  {
    kind: 'field (select)',
    block: {
      type: 'field',
      kind: 'select',
      label: 'Gliederung',
      options: ['Kreisverband', 'Landesverband'],
    },
    optional: ['options'],
  },
  {
    kind: 'signature',
    block: { type: 'signature', labels: ['Ort, Datum', 'Unterschrift'] },
    optional: [],
  },
];

const asDocument = (block: Record<string, unknown>): unknown => ({
  title: 'Testdokument',
  blocks: [block],
});

/**
 * The failure this suite exists for: `[PdfGeneration] structure rejected:
 * blocks.13.caption: Expected string, received null` — the model filled an
 * optional field with `null` ("not applicable") and the whole document was
 * discarded. `.optional()` accepts only `undefined`, so EVERY optional field
 * was a live version of this bug. The old suite tested only the obedient model.
 */
describe('model output survives the dialect the model actually speaks', () => {
  for (const { kind, block, optional } of BLOCK_CASES) {
    it(`accepts a fully specified ${kind} block`, () => {
      expect(pdfDocumentFromModelSchema.safeParse(asDocument(block)).success).toBe(true);
    });

    for (const field of optional) {
      it(`tolerates null in ${kind}.${field}`, () => {
        const parsed = pdfDocumentFromModelSchema.safeParse(
          asDocument({ ...block, [field]: null })
        );
        expect(parsed.success).toBe(true);
      });
    }
  }

  it('tolerates null in the document-level optionals', () => {
    const parsed = pdfDocumentFromModelSchema.safeParse({
      title: 'Testdokument',
      subtitle: null,
      letter: null,
      kind: null,
      language: null,
      blocks: [{ type: 'paragraph', text: 'Text.' }],
    });

    expect(parsed.success).toBe(true);
    // Dropping the null lets the schema default apply — it does not leak through.
    if (parsed.success) {
      expect(parsed.data.kind).toBe('document');
      expect(parsed.data.language).toBe('de-DE');
    }
  });

  it('keeps table geometry when a CELL is null', () => {
    // Dropping the cell would shift every later cell one column left, and
    // renderTable pads short rows at the END — the data would end up filed
    // under the wrong heading instead of being visibly empty.
    const parsed = pdfDocumentFromModelSchema.safeParse(
      asDocument({
        type: 'table',
        columns: ['Nr.', 'Quelle', 'URL'],
        rows: [['1', null, 'https://example.org']],
      })
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const table = parsed.data.blocks[0];
      expect(table?.type === 'table' && table.rows[0]).toEqual(['1', '', 'https://example.org']);
    }
  });

  it('still rejects broken structure — leniency covers absent values, not damage', () => {
    const cases: unknown[] = [
      { title: null, blocks: [{ type: 'paragraph', text: 'Text.' }] }, // required field
      asDocument({ type: 'paragraph', text: null }), // required field of a block
      asDocument({ type: 'gibberish', text: 'Text.' }), // unknown block type
      { title: 'Leer', blocks: [] },
    ];

    for (const input of cases) {
      expect(pdfDocumentFromModelSchema.safeParse(input).success).toBe(false);
    }
  });
});

/**
 * The flat wire schema has ONE type per property NAME across all block types.
 * A name used with two different types in `pdfDocumentSchema` is therefore not
 * a style question but a defect: the model follows the wire schema and the Zod
 * gate rejects the result. `rows` was exactly that — the table's `string[][]`
 * and the form field's line count — until the field was renamed to `lines`.
 */
describe('wire schema and Zod gate agree on every property name', () => {
  const blockProps = ((PDF_DOCUMENT_TOOL_SCHEMA.properties as Record<string, JsonSchema>).blocks
    .items?.properties ?? {}) as Record<string, JsonSchema>;

  it('declares rows as the table shape and lines as the field height', () => {
    expect(blockProps.rows?.type).toBe('array');
    expect(blockProps.lines?.type).toBe('integer');
  });

  it('offers every property some block type actually accepts', () => {
    // Each wire property must be reachable: it appears on at least one block in
    // BLOCK_CASES, which the suite above proves the gate accepts.
    const used = new Set(BLOCK_CASES.flatMap(({ block }) => Object.keys(block)));
    const unreachable = Object.keys(blockProps).filter((name) => !used.has(name));

    expect(unreachable).toEqual([]);
  });

  it('documents that nested list items stay export-only', () => {
    // pdfDocumentSchema allows `{text, level}` items (contentToBlocks emits them
    // from nested HTML lists), the wire schema deliberately does not: expressing
    // string|object needs `anyOf`, which the provider guard above forbids. So
    // chat-generated lists are flat by design, not by accident.
    expect(blockProps.items?.items?.type).toBe('string');
    expect(
      pdfDocumentSchema.safeParse(
        asDocument({ type: 'list', items: [{ text: 'Unterpunkt', level: 1 }] })
      ).success
    ).toBe(true);
  });
});
