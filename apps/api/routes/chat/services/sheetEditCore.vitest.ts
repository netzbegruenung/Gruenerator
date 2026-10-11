import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadSheetState: vi.fn<(...a: unknown[]) => unknown>(),
  formatSheetAsContext: vi.fn<(...a: unknown[]) => unknown>(),
  queueSheetOps: vi.fn<(...a: unknown[]) => unknown>(),
  checkDocumentWriteAccess: vi.fn<(...a: unknown[]) => unknown>(),
  generateSheetOperations: vi.fn<(...a: unknown[]) => unknown>(),
}));

vi.mock('../../../services/sheets/SheetGenerationService.js', () => ({
  loadSheetState: (...a: unknown[]) => mocks.loadSheetState(...a),
  formatSheetAsContext: (...a: unknown[]) => mocks.formatSheetAsContext(...a),
}));
vi.mock('../../../services/sheets/sheetOpsQueueService.js', () => ({
  queueSheetOps: (...a: unknown[]) => mocks.queueSheetOps(...a),
}));
vi.mock('../../docs/documentAccess.js', () => ({
  checkDocumentWriteAccess: (...a: unknown[]) => mocks.checkDocumentWriteAccess(...a),
}));
vi.mock('../../sheets/sheetAiService.js', () => ({
  generateSheetOperations: (...a: unknown[]) => mocks.generateSheetOperations(...a),
}));

const { planAndQueueSheetEdit, queuedSheetEditText } = await import('./sheetEditCore.js');

const run = (destructiveAllowed = false) =>
  planAndQueueSheetEdit({
    sheetId: 's1',
    userId: 'u1',
    instruction: 'mach das',
    destructiveAllowed,
  });

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.checkDocumentWriteAccess.mockResolvedValue(true);
  mocks.loadSheetState.mockResolvedValue({ title: 'Budget' });
  mocks.formatSheetAsContext.mockReturnValue('ctx');
  mocks.queueSheetOps.mockResolvedValue({ live: true });
});

describe('planAndQueueSheetEdit', () => {
  it('fails without write access and queues nothing', async () => {
    mocks.checkDocumentWriteAccess.mockResolvedValue(false);
    const out = await run();
    expect(out.status).toBe('failed');
    expect(mocks.queueSheetOps).not.toHaveBeenCalled();
    expect(mocks.loadSheetState).not.toHaveBeenCalled();
  });

  it('fails when the sheet is missing', async () => {
    mocks.loadSheetState.mockResolvedValue(null);
    const out = await run();
    expect(out).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('nicht finden'),
    });
    expect(mocks.queueSheetOps).not.toHaveBeenCalled();
  });

  it('fails when planning throws or yields nothing', async () => {
    mocks.generateSheetOperations.mockRejectedValue(new Error('boom'));
    expect(await run()).toMatchObject({ status: 'failed' });
    mocks.generateSheetOperations.mockResolvedValue([]);
    const out = await run();
    expect(out).toMatchObject({ status: 'failed', message: expect.stringContaining('konkrete') });
    expect(mocks.queueSheetOps).not.toHaveBeenCalled();
  });

  it('holds destructive ops back without permission', async () => {
    mocks.generateSheetOperations.mockResolvedValue([{ type: 'delete_columns' }]);
    const out = await run(false);
    expect(out).toEqual({
      status: 'needs_confirmation',
      title: 'Budget',
      summary: 'Spalten gelöscht',
    });
    expect(mocks.queueSheetOps).not.toHaveBeenCalled();
  });

  it('queues destructive ops with permission', async () => {
    mocks.generateSheetOperations.mockResolvedValue([{ type: 'delete_columns' }]);
    const out = await run(true);
    expect(out).toMatchObject({ status: 'queued', operationCount: 1 });
    expect(mocks.queueSheetOps).toHaveBeenCalledTimes(1);
  });

  it('queues non-destructive ops and passes live through', async () => {
    const ops = [{ type: 'format_range' }, { type: 'format_range' }];
    mocks.generateSheetOperations.mockResolvedValue(ops);
    mocks.queueSheetOps.mockResolvedValue({ live: false });
    const out = await run(false);
    expect(out).toEqual({
      status: 'queued',
      title: 'Budget',
      summary: '2× Formatierung',
      live: false,
      operationCount: 2,
    });
    expect(mocks.queueSheetOps).toHaveBeenCalledWith('s1', ops, '2× Formatierung');
  });

  it('reports an honest failure when queueing throws', async () => {
    mocks.generateSheetOperations.mockResolvedValue([{ type: 'format_range' }]);
    mocks.queueSheetOps.mockRejectedValue(new Error('redis down'));
    const out = await run();
    expect(out).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('nicht an die Tabelle übergeben'),
    });
  });
});

describe('queuedSheetEditText', () => {
  it('words live and not-live differently', () => {
    const base = { title: 'Budget', summary: '1× x' };
    expect(queuedSheetEditText({ ...base, live: true })).toContain('erscheint gleich');
    const later = queuedSheetEditText({ ...base, live: false });
    expect(later).toContain('sobald du die Tabelle öffnest');
    expect(later).not.toContain('erscheint gleich');
  });
});
