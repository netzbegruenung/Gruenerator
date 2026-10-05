import { beforeEach, describe, expect, it, vi } from 'vitest';

const mintCanvasForVariant = vi.fn();

vi.mock('../chat/services/sharepicEditService.js', () => ({ mintCanvasForVariant }));
vi.mock('../../services/canvas/canvasRepository.js', () => ({}));
vi.mock('../../services/canvas/canvasStateService.js', () => ({}));
vi.mock('../../services/canvas/canvasVersionRepository.js', () => ({}));
vi.mock('../exports/pageConstants.js', () => ({ getServerFormat: vi.fn() }));

const req = { user: { id: 'user-1', email: 'u@example.org' } } as never;
const base = { threadId: 't1', variantId: 'v1' };

const SPEC = {
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'farbe', color: 'tanne' },
      position: 'mitte',
      align: 'links',
      items: [{ type: 'headline', lines: ['Busse statt Stau'] }],
      logo: false,
    },
  ],
};

async function fromVariant(body: Record<string, unknown>) {
  const { canvasContractRouter } = await import('./canvasContractRouter.js');
  return (
    canvasContractRouter.fromVariant as unknown as (a: unknown) => Promise<{
      status: number;
      body: Record<string, unknown>;
    }>
  )({ req, body });
}

beforeEach(() => {
  mintCanvasForVariant.mockReset().mockResolvedValue({ canvasId: 'c1', minted: true });
});

describe('canvas.fromVariant', () => {
  it('mints a composed freeform page with its format', async () => {
    const res = await fromVariant({
      ...base,
      canvasType: 'freeform',
      initialProps: { pages: [{ id: 'seed-0', configId: 'freeform', state: {} }] },
      format: 'post-portrait-tall',
    });
    expect(res.status).toBe(201);
    expect(mintCanvasForVariant).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'post-portrait-tall' })
    );
  });

  it('rejects uncomposed creator props with a German message', async () => {
    const res = await fromVariant({
      ...base,
      canvasType: 'freeform',
      initialProps: { creatorSpec: SPEC, attributions: [null] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      'Dieses Sharepic kann diese App-Version noch nicht im Editor öffnen. Aktualisiere die App oder öffne es im Browser.'
    );
    expect(mintCanvasForVariant).not.toHaveBeenCalled();
  });

  it('rejects freeform without pages', async () => {
    const res = await fromVariant({ ...base, canvasType: 'freeform', initialProps: {} });
    expect(res.status).toBe(400);
  });

  it('mints a legacy template with format null', async () => {
    const res = await fromVariant({
      ...base,
      canvasType: 'dreizeilen',
      initialProps: { line1: 'a' },
    });
    expect(res.status).toBe(201);
    expect(mintCanvasForVariant).toHaveBeenCalledWith(expect.objectContaining({ format: null }));
  });

  it('passes the client title through to the mint', async () => {
    await fromVariant({
      ...base,
      canvasType: 'freeform',
      initialProps: { pages: [{ id: 'seed-0', configId: 'freeform', state: {} }] },
      format: 'post-portrait-tall',
      title: 'Busse statt Stau',
    });
    expect(mintCanvasForVariant).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Busse statt Stau' })
    );
  });

  it('mints without a title when the client sends none', async () => {
    await fromVariant({ ...base, canvasType: 'dreizeilen', initialProps: { line1: 'a' } });
    expect(mintCanvasForVariant).toHaveBeenCalledWith(expect.objectContaining({ title: null }));
  });
});
