import { getSharepicTemplateDescriptor } from '@gruenerator/contracts';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { appendRejectedOpsNote, applySharepicOpsToCanvas } from './sharepicEditService.js';

import type { SSEWriter } from './sseHelpers.js';

const { mockSelectBestImage, mockApplyPatch, mockInsertVersion } = vi.hoisted(() => ({
  mockSelectBestImage: vi.fn(),
  mockApplyPatch: vi.fn(),
  mockInsertVersion: vi.fn(),
}));

vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: vi.fn() }),
}));
vi.mock('../../../services/image/ImageSelectionService.js', () => ({
  default: { selectBestImage: mockSelectBestImage },
}));
vi.mock('../../../services/canvas/canvasStateService.js', () => ({
  applyCanvasStatePatch: mockApplyPatch,
  applyDeckChanges: vi.fn(),
  getCurrentCanvasState: vi.fn(),
  seedCanvasPages: vi.fn(),
}));
vi.mock('../../../services/canvas/canvasVersionRepository.js', () => ({
  insertCanvasVersion: mockInsertVersion,
  listCanvasVersions: vi.fn(),
}));

const reply =
  'Den CTA auf „Kostenlos anmelden" aktualisiert und den Hintergrund zu hellem Creme geändert.';

describe('appendRejectedOpsNote', () => {
  it('leaves a fully applied edit alone', () => {
    expect(appendRejectedOpsNote(reply, [])).toBe(reply);
  });

  it('names what did NOT land when only part of the edit applied', () => {
    // The live case: set-text applied, set-background-color was rejected by the
    // template — and the reply claimed both.
    const out = appendRejectedOpsNote(reply, [
      {
        kind: 'set-background-color',
        reason: 'Operation "set-background-color" wird von dreizeilen-overlay-at nicht unterstützt',
      },
    ]);

    expect(out.startsWith(reply)).toBe(true);
    expect(out).toContain('Nicht übernommen');
    expect(out).toContain('dreizeilen-overlay-at');
  });

  it('collapses duplicate reasons', () => {
    const out = appendRejectedOpsNote(reply, [
      { kind: 'set-background-color', reason: 'Vorlage unterstützt das nicht' },
      { kind: 'set-element-color', reason: 'Vorlage unterstützt das nicht' },
    ]);

    expect(out.match(/Vorlage unterstützt das nicht/g)).toHaveLength(1);
  });
});

describe('applySharepicOpsToCanvas — failed background lookup (#3290)', () => {
  const descriptor = getSharepicTemplateDescriptor('dreizeilen');
  if (!descriptor) throw new Error('dreizeilen descriptor missing');
  const sse = { send: vi.fn() } as unknown as SSEWriter;
  const base = {
    canvasId: 'c1',
    variantId: 'v1',
    canvasType: 'dreizeilen',
    descriptor,
    state: { line1: 'Alt', currentImageSrc: '/alt.jpg' },
    summary: 'Text und Hintergrund',
    userId: 'u1',
    sse,
  };
  const setText = { kind: 'set-text', field: 'line1', label: 'Erste Zeile', value: 'Neu' } as const;
  const setImage = { kind: 'set-background-image', query: 'Windräder im Sonnenuntergang' } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertVersion.mockResolvedValue(2);
  });

  it('reports the background as not applied when no stock image is found', async () => {
    mockSelectBestImage.mockRejectedValue(new Error('no candidates'));

    const outcome = await applySharepicOpsToCanvas({ ...base, operations: [setText, setImage] });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.appliedKinds).toEqual(['set-text']);
    expect(outcome.rejected).toEqual([
      { kind: 'set-background-image', reason: expect.stringContaining('Hintergrundbild') },
    ]);
    expect(outcome.newState.currentImageSrc).toBe('/alt.jpg');
    expect(appendRejectedOpsNote('Fertig.', outcome.rejected)).toContain('Nicht übernommen');
  });

  it('fails the whole edit when the background was the only change', async () => {
    mockSelectBestImage.mockRejectedValue(new Error('no candidates'));

    const outcome = await applySharepicOpsToCanvas({ ...base, operations: [setImage] });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain('Hintergrundbild');
    expect(mockApplyPatch).not.toHaveBeenCalled();
    expect(sse.send).not.toHaveBeenCalled();
  });

  it('keeps the background in applied when the lookup succeeds', async () => {
    mockSelectBestImage.mockResolvedValue({ selectedImage: { filename: 'wind.jpg' } });

    const outcome = await applySharepicOpsToCanvas({ ...base, operations: [setText, setImage] });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.appliedKinds).toEqual(['set-text', 'set-background-image']);
    expect(outcome.rejected).toEqual([]);
    expect(outcome.newState.currentImageSrc).toBe('/api/image-picker/stock-image/wind.jpg');
  });
});
