/**
 * Content model for generated PDFs.
 *
 * The renderer takes a block list instead of a markdown blob so the model can
 * describe anything a PDF needs — including form fields, which markdown cannot
 * express at all. Every block maps 1:1 onto a PDF structure element, which is
 * what makes the tagged (accessible) output possible; a markdown blob would
 * have to be re-parsed into structure on every render.
 */

import { z } from 'zod';

const inlineText = z.string().min(1).max(20000);

/** Text fields are the only kind that carry `options`; the renderer ignores extras. */
const pdfFieldKindSchema = z.enum(['text', 'multiline', 'date', 'checkbox', 'radio', 'select']);

export const pdfBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('heading'),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
    text: inlineText,
  }),
  z.object({ type: z.literal('paragraph'), text: inlineText }),
  z.object({
    type: z.literal('list'),
    ordered: z.boolean().optional(),
    /**
     * Ein Eintrag ist entweder nur Text (oberste Ebene) oder trägt seine
     * Verschachtelungstiefe mit. Ohne `level` zählte eine Unterliste in der
     * Nummerierung der Hauptliste mit — aus "2. / 2.1 / 3." wurde "2. / 3. / 4."
     * und damit eine falsche Gliederung.
     */
    items: z
      .array(
        z.union([
          inlineText,
          z.object({
            text: inlineText,
            level: z.number().int().min(0).max(3).default(0),
            ordered: z.boolean().optional(),
          }),
        ])
      )
      .min(1)
      .max(200),
  }),
  z.object({
    type: z.literal('table'),
    columns: z.array(z.string()).min(1).max(8),
    rows: z.array(z.array(z.string()).max(8)).max(200),
    caption: z.string().max(300).optional(),
  }),
  z.object({ type: z.literal('quote'), text: inlineText, source: z.string().max(300).optional() }),
  z.object({ type: z.literal('note'), text: inlineText, title: z.string().max(200).optional() }),
  z.object({
    type: z.literal('keyvalue'),
    entries: z
      .array(z.object({ label: z.string().max(200), value: z.string().max(2000) }))
      .min(1)
      .max(60),
  }),
  z.object({ type: z.literal('divider') }),
  z.object({ type: z.literal('pagebreak') }),
  z.object({
    type: z.literal('field'),
    kind: pdfFieldKindSchema.default('text'),
    label: z.string().min(1).max(300),
    /** Stable AcroForm field name; derived from the label when omitted. */
    name: z.string().max(100).optional(),
    options: z.array(z.string().max(200)).max(30).optional(),
    required: z.boolean().optional(),
    /** Rendered as a small hint under the field AND as the widget's tooltip. */
    help: z.string().max(300).optional(),
    width: z.enum(['full', 'half']).optional(),
    /** Multiline height in text rows. */
    rows: z.number().int().min(2).max(20).optional(),
  }),
  z.object({
    type: z.literal('signature'),
    labels: z.array(z.string().max(200)).min(1).max(3),
  }),
]);

const pdfLetterSchema = z.object({
  recipient: z.string().max(600).nullish(),
  place: z.string().max(200).nullish(),
  subject: z.string().max(400).nullish(),
  salutation: z.string().max(300).nullish(),
  closing: z.string().max(200).nullish(),
  signature: z.string().max(400).nullish(),
});

export const pdfDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).nullish(),
  /** Drives the page furniture: report layout, DIN-5008 letter, or form. */
  kind: z.enum(['document', 'letter', 'form']).default('document'),
  /** Written to the catalog's /Lang — screen readers pick pronunciation from it. */
  language: z.string().min(2).max(10).default('de-DE'),
  letter: pdfLetterSchema.nullish(),
  blocks: z.array(pdfBlockSchema).min(1).max(400),
});

export type PdfBlock = z.infer<typeof pdfBlockSchema>;
export type PdfDocumentSpec = z.infer<typeof pdfDocumentSchema>;

/**
 * The schema shown to the MODEL for the forced tool call — deliberately NOT
 * `zodToJsonSchema(pdfDocumentSchema)`.
 *
 * That would emit an 11-member discriminated union plus a nested
 * string|object union inside list items, i.e. deep `anyOf`. gpt-oss (via
 * LiteLLM) and Mistral handle that badly, and strict provider schema modes
 * additionally reject `default`. So the wire schema is flat: one block object
 * with every field optional except `type`, and `additionalProperties: true`.
 *
 * Only `title` and `blocks` are required — exactly the two whose absence broke
 * generation in production. The real strictness stays in `pdfDocumentSchema`,
 * which validates the tool output afterwards.
 */
export const PDF_DOCUMENT_TOOL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['title', 'blocks'],
  additionalProperties: true,
  properties: {
    title: { type: 'string', description: 'Dokumenttitel, nicht leer' },
    subtitle: { type: 'string' },
    kind: { type: 'string', enum: ['document', 'letter', 'form'] },
    language: { type: 'string' },
    letter: {
      type: 'object',
      additionalProperties: true,
      properties: {
        recipient: { type: 'string' },
        place: { type: 'string' },
        subject: { type: 'string' },
        salutation: { type: 'string' },
        closing: { type: 'string' },
        signature: { type: 'string' },
      },
    },
    blocks: {
      type: 'array',
      minItems: 1,
      description: 'Inhaltsblöcke in Lesereihenfolge, mindestens einer',
      items: {
        type: 'object',
        required: ['type'],
        additionalProperties: true,
        properties: {
          type: {
            type: 'string',
            enum: [
              'heading',
              'paragraph',
              'list',
              'table',
              'quote',
              'note',
              'keyvalue',
              'divider',
              'pagebreak',
              'field',
              'signature',
            ],
          },
          text: { type: 'string' },
          level: { type: 'integer', enum: [1, 2, 3] },
          ordered: { type: 'boolean' },
          items: { type: 'array', items: { type: 'string' } },
          columns: { type: 'array', items: { type: 'string' } },
          rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
          caption: { type: 'string' },
          source: { type: 'string' },
          title: { type: 'string' },
          entries: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: { label: { type: 'string' }, value: { type: 'string' } },
            },
          },
          kind: {
            type: 'string',
            enum: ['text', 'multiline', 'date', 'checkbox', 'radio', 'select'],
          },
          label: { type: 'string' },
          name: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          required: { type: 'boolean' },
          help: { type: 'string' },
          width: { type: 'string', enum: ['full', 'half'] },
          labels: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

/**
 * AcroForm field names must be unique and must not contain '.' (that builds a
 * field hierarchy) — collisions would silently merge two fields into one.
 */
export function fieldName(block: Extract<PdfBlock, { type: 'field' }>, taken: Set<string>): string {
  const base =
    (block.name || block.label)
      .toLowerCase()
      .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] ?? c)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'feld';
  let name = base;
  let i = 2;
  while (taken.has(name)) name = `${base}_${i++}`;
  taken.add(name);
  return name;
}
