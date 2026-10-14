import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveMock, reviewMock } = vi.hoisted(() => ({
  resolveMock: vi.fn(),
  reviewMock: vi.fn(),
}));
vi.mock('../services/sharepicLoopTarget.js', () => ({ resolveLoopSharepicTarget: resolveMock }));
vi.mock('../../../services/sharepicCreator/review.js', () => ({ reviewSharepic: reviewMock }));

import {
  renderedImageOf,
  resolveCheckSharepicRender,
  reviewRenderedSharepic,
} from './sharepicCheckTool.js';

const target = {
  prior: { variantId: 'v1', canvasType: 'freeform', props: {}, canvasId: null },
  props: { creatorSpec: { slides: [] }, attributions: [] },
};

beforeEach(() => vi.clearAllMocks());

describe('resolveCheckSharepicRender', () => {
  it('liefert dem Browser variantId, canvasType und die Props des Ziels', async () => {
    resolveMock.mockResolvedValue(target);

    const out = await resolveCheckSharepicRender(
      't1',
      { currentSharepic: { variantId: 'v0', canvasType: 'freeform' } },
      { variantId: 'v1' }
    );

    expect(resolveMock).toHaveBeenCalledWith(
      't1',
      { variantId: 'v0', canvasType: 'freeform' },
      'v1'
    );
    expect(out).toEqual({
      clientToolName: 'render_sharepic',
      clientArgs: { variantId: 'v1', canvasType: 'freeform', initialProps: target.props },
    });
  });

  it('ohne Ziel ein Fehler fürs Modell statt einer Pause', async () => {
    resolveMock.mockResolvedValue(null);
    expect(await resolveCheckSharepicRender('t1', { currentSharepic: null }, {})).toEqual({
      error: expect.stringContaining('kein Sharepic'),
    });
  });
});

describe('renderedImageOf', () => {
  it('nimmt nur Bild-Data-URLs', () => {
    expect(renderedImageOf({ image: 'data:image/png;base64,AA' })).toBe('data:image/png;base64,AA');
    expect(renderedImageOf({ image: null })).toBeNull();
    expect(renderedImageOf({ image: 'https://evil.example/x.png' })).toBeNull();
    expect(renderedImageOf({ error: 'x' })).toBeNull();
    expect(renderedImageOf(null)).toBeNull();
  });
});

describe('reviewRenderedSharepic', () => {
  const base = { threadId: 't1', variantId: 'v1', image: 'data:image/png;base64,AA' };

  it('prüft das Bild im edit-Modus mit der Anfrage der Person', async () => {
    resolveMock.mockResolvedValue(target);
    reviewMock.mockResolvedValue({ ok: false, issues: ['Slide 0: Text zu klein'], patch: [] });

    const out = await reviewRenderedSharepic({ ...base, userText: 'Passt das so?' });

    expect(reviewMock).toHaveBeenCalledWith(
      target.props.creatorSpec,
      'Passt das so?',
      base.image,
      'edit'
    );
    expect(out).toEqual({ ok: false, issues: ['Slide 0: Text zu klein'] });
  });

  it('gibt den Patch mit, wenn die Prüfung einen liefert; ohne Anfrage ein Standardauftrag', async () => {
    resolveMock.mockResolvedValue(target);
    const patch = [{ op: 'set_headline', slide: 0, lines: ['Kürzer'] }];
    reviewMock.mockResolvedValue({ ok: false, issues: ['zu lang'], patch });

    const out = await reviewRenderedSharepic({ ...base, userText: null });

    expect(reviewMock.mock.calls[0]![1]).toBe('Prüfe das Sharepic');
    expect(out).toEqual({ ok: false, issues: ['zu lang'], patch });
  });

  it('ohne Bild eine Notiz statt einer Prüfung', async () => {
    const out = await reviewRenderedSharepic({ ...base, image: null, userText: 'x' });
    expect(reviewMock).not.toHaveBeenCalled();
    expect(out).toEqual({ ok: false, note: expect.stringContaining('nicht gerendert') });
  });

  it('ohne Ziel (inzwischen gelöscht) ebenfalls eine Notiz', async () => {
    resolveMock.mockResolvedValue(null);
    const out = await reviewRenderedSharepic({ ...base, userText: 'x' });
    expect(reviewMock).not.toHaveBeenCalled();
    expect(out).toMatchObject({ ok: false, note: expect.any(String) });
  });
});
