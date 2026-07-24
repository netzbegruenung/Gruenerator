/**
 * read_pdf_form / fill_pdf_form against real generated AcroForm PDFs.
 *
 * The pagination tests are the important ones: the loop's generic safety net
 * (truncateResultForModel) caps ANY array at 20 items once a tool result passes
 * ~6000 chars. A 200-field form would silently lose 180 field names, and the
 * model would fill 20 and report success — so the tool must page explicitly.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

import { truncateResultForModel } from '../services/agenticLoop/truncate.js';

import { makeReadPdfFormTool, makeFillPdfFormTool } from './pdfFormTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const persistComputeAssets = vi.fn();
vi.mock('../services/computeAssetStorage.js', () => ({
  persistComputeAssets: (...args: unknown[]) => persistComputeAssets(...args),
}));
vi.mock('../services/attachmentPersistenceService.js', () => ({
  getThreadPdfFiles: () => Promise.resolve([]),
}));

async function buildForm(fieldCount: number): Promise<string> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  const form = pdfDoc.getForm();
  for (let i = 0; i < fieldCount; i++) {
    const f = form.createTextField(`antragsteller_feld_${i}`);
    f.addToPage(page, { x: 20, y: 20, width: 100, height: 12 });
  }
  return Buffer.from(await pdfDoc.save()).toString('base64');
}

function makeCtx(data: string) {
  const sent: Array<{ event: string; payload: unknown }> = [];
  const state = {
    pdfFormAttachments: [{ name: 'antrag.pdf', data }],
    agentConfig: { userId: 'user-1' },
  } as unknown as ChatGraphState;
  const sse = {
    send: (event: string, payload: unknown) => sent.push({ event, payload }),
  } as unknown as SSEWriter;
  return { ctx: { state, sse, threadId: 't1' }, sent, state };
}

// The AI-SDK Tool type keeps execute optional/loosely typed; the loop always
// calls it, so the tests do too.
const run = (tool: unknown, input: unknown) =>
  (tool as { execute: (i: unknown, o: unknown) => Promise<Record<string, unknown>> }).execute(
    input,
    { toolCallId: 'c1', messages: [] }
  );

describe('pdfFormTools', () => {
  let smallForm: string;
  let hugeForm: string;

  beforeAll(async () => {
    smallForm = await buildForm(3);
    hugeForm = await buildForm(200);
  }, 60_000);

  it('lists fields of a small form in one page, without paging hints', async () => {
    const { ctx } = makeCtx(smallForm);
    const result = await run(makeReadPdfFormTool(ctx), {});

    expect(result.fieldCount).toBe(3);
    expect(result.hasMore).toBeUndefined();
    expect((result.fields as unknown[]).length).toBe(3);
  });

  it('pages a huge form and stays under the loop truncation cap', async () => {
    const { ctx } = makeCtx(hugeForm);
    const first = await run(makeReadPdfFormTool(ctx), {});

    expect(first.fieldCount).toBe(200);
    expect((first.fields as unknown[]).length).toBe(50);
    expect(first.hasMore).toBe(true);
    expect(first.nextOffset).toBe(50);

    // The whole point: a page must survive the safety net untouched, so no
    // field name is silently dropped.
    expect(truncateResultForModel(first, 6000)).toBe(first);
  });

  it('reaches the tail of a huge form via the reported offset', async () => {
    const { ctx } = makeCtx(hugeForm);
    const last = await run(makeReadPdfFormTool(ctx), { offset: 150 });

    expect((last.fields as Array<{ name: string }>)[49].name).toBe('antragsteller_feld_199');
    expect(last.hasMore).toBeUndefined();
  });

  it('reports a flat PDF as unfillable instead of failing silently', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const flat = Buffer.from(await doc.save()).toString('base64');

    const { ctx } = makeCtx(flat);
    const result = await run(makeReadPdfFormTool(ctx), {});

    expect(result.fieldCount).toBe(0);
    expect(String(result.note)).toMatch(/keine ausfüllbaren Formularfelder/);
  });

  it('fills, streams a compute event and seeds the state for persistence', async () => {
    persistComputeAssets.mockImplementation((_u: string, payload: Record<string, unknown>) =>
      Promise.resolve({ ...payload, files: undefined, fileAssets: [{ name: 'x.pdf', url: '/u' }] })
    );
    const { ctx, sent, state } = makeCtx(smallForm);

    const result = await run(makeFillPdfFormTool(ctx), {
      values: { antragsteller_feld_0: 'Wert A', antragsteller_feld_1: 'Wert B' },
    });

    expect(result.ok).toBe(true);
    expect(result.filledCount).toBe(2);
    expect(result.fileName).toBe('antrag_ausgefuellt.pdf');
    // Without both of these the download chip never renders / never survives a
    // reload: the event draws it, the state field persists it.
    expect(sent.map((s) => s.event)).toContain('compute');
    expect(state.computedResultFresh).toBe(true);
    expect(state.computedResult).not.toBeNull();
  });

  it('returns an actionable error when no field name matched', async () => {
    const { ctx, sent } = makeCtx(smallForm);
    const result = await run(makeFillPdfFormTool(ctx), { values: { gibtesnicht: 'x' } });

    expect(result.error).toBeDefined();
    expect(String(result.hint)).toMatch(/read_pdf_form/);
    // No half-success: nothing is streamed and no asset is written.
    expect(sent).toHaveLength(0);
  });
});
