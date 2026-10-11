import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadPresentationState: vi.fn<(...a: unknown[]) => unknown>(),
  formatPresentationAsContext: vi.fn<(...a: unknown[]) => unknown>(),
  applyPresentationOpsLive: vi.fn<(...a: unknown[]) => unknown>(),
  checkDocumentWriteAccess: vi.fn<(...a: unknown[]) => unknown>(),
  generatePresentationOperations: vi.fn<(...a: unknown[]) => unknown>(),
}));

vi.mock('../../../services/presentations/PresentationGenerationService.js', () => ({
  loadPresentationState: (...a: unknown[]) => mocks.loadPresentationState(...a),
  formatPresentationAsContext: (...a: unknown[]) => mocks.formatPresentationAsContext(...a),
}));
vi.mock('../../../services/presentations/presentationOpsService.js', () => ({
  applyPresentationOpsLive: (...a: unknown[]) => mocks.applyPresentationOpsLive(...a),
}));
vi.mock('../../docs/documentAccess.js', () => ({
  checkDocumentWriteAccess: (...a: unknown[]) => mocks.checkDocumentWriteAccess(...a),
}));
vi.mock('../../presentations/presentationAiService.js', () => ({
  generatePresentationOperations: (...a: unknown[]) => mocks.generatePresentationOperations(...a),
}));

const { planAndApplyPresentationEdit } = await import('./presentationEditCore.js');

const run = (destructiveAllowed = false) =>
  planAndApplyPresentationEdit({
    presentationId: 'p1',
    userId: 'u1',
    instruction: 'mach das',
    destructiveAllowed,
  });

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.checkDocumentWriteAccess.mockResolvedValue(true);
  mocks.loadPresentationState.mockResolvedValue({ title: 'Verkehrswende', brand: 'de-DE' });
  mocks.formatPresentationAsContext.mockReturnValue('ctx');
  mocks.generatePresentationOperations.mockResolvedValue([{ type: 'update_slide', slide: 1 }]);
  mocks.applyPresentationOpsLive.mockResolvedValue({ applied: 1, skipped: [], live: true });
});

describe('planAndApplyPresentationEdit', () => {
  it('refuses without write access', async () => {
    mocks.checkDocumentWriteAccess.mockResolvedValue(false);
    expect((await run()).status).toBe('failed');
    expect(mocks.applyPresentationOpsLive).not.toHaveBeenCalled();
  });

  it('fails when the deck is gone', async () => {
    mocks.loadPresentationState.mockResolvedValue(null);
    expect(await run()).toMatchObject({
      status: 'failed',
      message: expect.stringMatching(/finden/),
    });
  });

  it('asks before deleting a slide', async () => {
    mocks.generatePresentationOperations.mockResolvedValue([{ type: 'delete_slide', slide: 2 }]);
    expect((await run(false)).status).toBe('needs_confirmation');
    expect(mocks.applyPresentationOpsLive).not.toHaveBeenCalled();
    expect((await run(true)).status).toBe('applied');
  });

  it('applies and reports live', async () => {
    expect(await run()).toMatchObject({ status: 'applied', title: 'Verkehrswende', live: true });
  });

  it('says why nothing changed when every op was skipped', async () => {
    mocks.applyPresentationOpsLive.mockResolvedValue({
      applied: 0,
      skipped: ['Folie 9 existiert nicht.'],
      live: false,
    });
    expect(await run()).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('Folie 9 existiert nicht.'),
    });
  });

  it('reports a failed write honestly', async () => {
    mocks.applyPresentationOpsLive.mockRejectedValue(new Error('down'));
    expect(await run()).toMatchObject({
      status: 'failed',
      message: expect.stringMatching(/nicht in die Präsentation/),
    });
  });
});
