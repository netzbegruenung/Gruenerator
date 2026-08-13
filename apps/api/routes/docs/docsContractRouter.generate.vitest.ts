/**
 * POST /api/docs/generate — the REST generation path.
 *
 * It used to prompt for JSON and parse whatever came back, so any answer that
 * was not bare JSON (prose preamble, fenced block, cut-off output) turned into
 * a 500 "Failed to generate document" — observed in production on 13.08.2026.
 * These tests pin the schema-enforced path (forced tool call + repair turn).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIWorkerResult } from '../../workers/types.js';
import type { Request } from 'express';

const processRequest = vi.fn<(...a: unknown[]) => Promise<AIWorkerResult>>();
const createDocumentWithContent = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: vi.fn().mockResolvedValue([]) }),
}));

vi.mock('../../utils/getAIWorkerPool.js', () => ({
  getAIWorkerPool: () => ({ processRequest }),
}));

vi.mock('../../services/docs/DocGenerationService.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/docs/DocGenerationService.js')>()),
  createDocumentWithContent: (...args: unknown[]) => createDocumentWithContent(...args),
}));

const { docsContractRouter } = await import('./docsContractRouter.js');

const generate = (description: string) =>
  (
    docsContractRouter.generateDocument as unknown as (a: {
      req: Request;
      body: { description: string };
    }) => Promise<{ status: number; body: Record<string, unknown> }>
  )({
    req: { user: { id: 'user-1' }, originalUrl: '/api/docs/generate' } as unknown as Request,
    body: { description },
  });

const DOC = { title: 'Niedrigwasser', subtype: 'blank', content: '<h1>Niedrigwasser</h1>' };

beforeEach(() => {
  processRequest.mockReset();
  createDocumentWithContent.mockReset();
  createDocumentWithContent.mockImplementation((title: string) =>
    Promise.resolve({ id: 'doc-1', title, content: DOC.content })
  );
});

describe('generateDocument', () => {
  it('accepts a tool call', async () => {
    processRequest.mockResolvedValue({
      success: true,
      tool_calls: [{ name: 'create_document', input: DOC }],
    } as unknown as AIWorkerResult);

    const res = await generate('Skript zum Thema Niedrigwasser');

    expect(res.status).toBe(201);
    expect(createDocumentWithContent).toHaveBeenCalledWith(
      DOC.title,
      DOC.content,
      'blank',
      'user-1'
    );
    expect(processRequest.mock.calls[0][0]).toMatchObject({
      options: { tool_choice: 'required' },
    });
  });

  it('recovers JSON wrapped in prose instead of failing with a 500', async () => {
    processRequest.mockResolvedValue({
      success: true,
      content: `Gerne! Hier ist das Dokument:\n\n\`\`\`json\n${JSON.stringify(DOC)}\n\`\`\``,
    } as unknown as AIWorkerResult);

    const res = await generate('tiktokskrpt zum Thema Niedrigwasser');

    expect(res.status).toBe(201);
    expect(createDocumentWithContent).toHaveBeenCalled();
  });

  it('repairs an unusable first answer instead of failing the request', async () => {
    processRequest
      .mockResolvedValueOnce({
        success: true,
        content: 'Worum genau soll es in dem Dokument gehen?',
      } as unknown as AIWorkerResult)
      .mockResolvedValueOnce({
        success: true,
        tool_calls: [{ name: 'create_document', input: DOC }],
      } as unknown as AIWorkerResult);

    const res = await generate('tiktokskrpt zum Thema Niedrigwasser');

    expect(res.status).toBe(201);
    expect(processRequest).toHaveBeenCalledTimes(2);
  });

  it('reports a 500 only when every attempt failed', async () => {
    processRequest.mockResolvedValue({
      success: true,
      content: 'Ich kann das leider nicht.',
    } as unknown as AIWorkerResult);

    const res = await generate('tiktokskrpt zum Thema Niedrigwasser');

    expect(res.status).toBe(500);
    expect(createDocumentWithContent).not.toHaveBeenCalled();
  });

  it('rejects a too-short description without calling the model', async () => {
    const res = await generate('hi');

    expect(res.status).toBe(400);
    expect(processRequest).not.toHaveBeenCalled();
  });
});
