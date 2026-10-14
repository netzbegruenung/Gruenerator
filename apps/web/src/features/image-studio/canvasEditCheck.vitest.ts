import { describe, expect, it, vi } from 'vitest';

import { checkEditedCanvas, formatCheckHint } from './canvasEditCheck';

const IMAGE = 'data:image/png;base64,AAAA';

function deps(over?: Partial<Parameters<typeof checkEditedCanvas>[0]>) {
  return {
    capture: vi.fn(async () => IMAGE),
    check: vi.fn(async () => ({ ok: true, issues: [] as { text: string }[] })),
    waitForFrame: vi.fn(async () => {}),
    isStale: vi.fn(() => false),
    instruction: 'Zitat gekürzt',
    ...over,
  };
}

describe('formatCheckHint', () => {
  it('prefixes the issues with Hinweis and joins them', () => {
    expect(formatCheckHint([{ text: 'Text läuft aus dem Bild.' }, { text: 'Kontrast.' }])).toBe(
      'Hinweis: Text läuft aus dem Bild. Kontrast.'
    );
  });

  it('is null without issues', () => {
    expect(formatCheckHint([])).toBeNull();
  });
});

describe('checkEditedCanvas', () => {
  it('waits for a frame, captures, checks and returns the hint', async () => {
    const d = deps({
      check: vi.fn(async () => ({ ok: false, issues: [{ text: 'Text ist abgeschnitten.' }] })),
    });
    expect(await checkEditedCanvas(d)).toBe('Hinweis: Text ist abgeschnitten.');
    expect(d.waitForFrame).toHaveBeenCalled();
    expect(d.check).toHaveBeenCalledWith(IMAGE, 'Zitat gekürzt');
  });

  it('returns null for a clean page', async () => {
    expect(await checkEditedCanvas(deps())).toBeNull();
  });

  it('skips the check when no image can be captured', async () => {
    const d = deps({ capture: vi.fn(async () => null) });
    expect(await checkEditedCanvas(d)).toBeNull();
    expect(d.check).not.toHaveBeenCalled();
  });

  it('drops the result when a newer edit arrived meanwhile', async () => {
    let stale = false;
    const d = deps({
      isStale: () => stale,
      check: vi.fn(async () => {
        stale = true;
        return { ok: false, issues: [{ text: 'Veraltet.' }] };
      }),
    });
    expect(await checkEditedCanvas(d)).toBeNull();
  });

  it('never throws: a failing check yields no hint', async () => {
    const d = deps({
      check: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    expect(await checkEditedCanvas(d)).toBeNull();
  });
});
