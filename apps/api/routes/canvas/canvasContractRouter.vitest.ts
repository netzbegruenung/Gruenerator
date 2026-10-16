import { beforeEach, describe, expect, it, vi } from 'vitest';

const mintCanvasForVariant = vi.fn();
const checkCanvasEdit = vi.fn();
const checkCanvasWriteAccess = vi.fn();
const updateCanvas = vi.fn();
const applyDeckChanges = vi.fn();
const resizeCanvas = vi.fn();
const formatChangeCrossesCategory = vi.fn();
const getServerFormat = vi.fn();
const createCanvas = vi.fn();
const seedCanvasPages = vi.fn();
const getCanvas = vi.fn();
const listCanvases = vi.fn();

vi.mock('./services/canvasAiCheck.js', () => ({ checkCanvasEdit }));
vi.mock('../chat/services/sharepicEditService.js', () => ({ mintCanvasForVariant }));
vi.mock('../../services/canvas/canvasRepository.js', () => ({
  createCanvas,
  checkCanvasWriteAccess,
  updateCanvas,
  resizeCanvas,
  formatChangeCrossesCategory,
  getCanvas,
  listCanvases,
}));
vi.mock('../../services/canvas/canvasStateService.js', () => ({
  applyDeckChanges,
  seedCanvasPages,
}));
vi.mock('../../services/canvas/canvasVersionRepository.js', () => ({}));
vi.mock('../exports/pageConstants.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getServerFormat,
}));

const CATEGORY_ERROR = 'Druckformate und digitale Formate lassen sich nicht ineinander umwandeln.';

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

describe('canvas.aiCheck', () => {
  it('returns the check result as 200', async () => {
    checkCanvasEdit.mockResolvedValue({ ok: false, issues: [{ text: 'Kontrast zu schwach.' }] });
    const { canvasContractRouter } = await import('./canvasContractRouter.js');
    const res = await (
      canvasContractRouter.aiCheck as unknown as (a: unknown) => Promise<{
        status: number;
        body: unknown;
      }>
    )({ req, body: { image: 'data:image/jpeg;base64,AAAA', instruction: 'Mach es größer' } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: false, issues: [{ text: 'Kontrast zu schwach.' }] });
    expect(checkCanvasEdit).toHaveBeenCalledWith('data:image/jpeg;base64,AAAA', 'Mach es größer');
  });
});

describe('canvas.replacePages', () => {
  const pages = [{ id: 'seed-0', configId: 'freeform', state: { headline: 'Neu' } }];
  const replace = async (body: Record<string, unknown>) => {
    const { canvasContractRouter } = await import('./canvasContractRouter.js');
    return (
      canvasContractRouter.replacePages as unknown as (a: unknown) => Promise<{
        status: number;
        body: unknown;
      }>
    )({ req, params: { id: 'c1' }, body });
  };

  beforeEach(() => {
    checkCanvasWriteAccess.mockReset().mockResolvedValue({ kind: 'ok' });
    updateCanvas.mockReset().mockResolvedValue({ kind: 'ok' });
    applyDeckChanges.mockReset().mockResolvedValue(undefined);
    formatChangeCrossesCategory.mockReset().mockResolvedValue(false);
  });

  it('replaces the whole page set and the format', async () => {
    const res = await replace({ pages, format: 'post-portrait-tall' });
    expect(res.status).toBe(200);
    expect(applyDeckChanges).toHaveBeenCalledWith('c1', {
      seedPages: pages,
      replacePages: pages,
      newPages: pages,
    });
    expect(updateCanvas).toHaveBeenCalledWith('c1', 'user-1', { format: 'post-portrait-tall' });
  });

  it('leaves the format alone when none is sent', async () => {
    await replace({ pages });
    expect(updateCanvas).not.toHaveBeenCalled();
  });

  it('refuses a format of the other category before replacing any page', async () => {
    formatChangeCrossesCategory.mockResolvedValue(true);
    const res = await replace({ pages, format: 'print-a3-hoch' });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe(CATEGORY_ERROR);
    expect(formatChangeCrossesCategory).toHaveBeenCalledWith('c1', 'print-a3-hoch');
    expect(applyDeckChanges).not.toHaveBeenCalled();
    expect(updateCanvas).not.toHaveBeenCalled();
  });

  it('does not look up the format when none is sent', async () => {
    await replace({ pages });
    expect(formatChangeCrossesCategory).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', 404],
    ['forbidden', 403],
  ])('answers %s with %i and writes nothing', async (kind, status) => {
    checkCanvasWriteAccess.mockResolvedValue({ kind });
    const res = await replace({ pages });
    expect(res.status).toBe(status);
    expect(applyDeckChanges).not.toHaveBeenCalled();
  });
});

describe('canvas.resize', () => {
  const resize = async (formatId: string) => {
    const { canvasContractRouter } = await import('./canvasContractRouter.js');
    return (
      canvasContractRouter.resize as unknown as (a: unknown) => Promise<{
        status: number;
        body: Record<string, unknown>;
      }>
    )({ req, params: { id: 'c1' }, body: { formatId } });
  };

  beforeEach(() => {
    getServerFormat.mockReset().mockReturnValue({ id: 'x' });
    resizeCanvas.mockReset().mockResolvedValue({ kind: 'ok', newCanvasId: 'c2' });
  });

  it('duplicates into a known format', async () => {
    const res = await resize('post-portrait-tall');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ newCanvasId: 'c2' });
  });

  it('refuses to turn a digital canvas into print and vice versa', async () => {
    resizeCanvas.mockResolvedValue({ kind: 'category_mismatch' });
    const res = await resize('print-a3-hoch');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(CATEGORY_ERROR);
  });

  it('rejects an unknown format before touching the canvas', async () => {
    getServerFormat.mockReturnValue(null);
    const res = await resize('print-a5-quer');
    expect(res.status).toBe(400);
    expect(resizeCanvas).not.toHaveBeenCalled();
  });
});

describe('canvas.update', () => {
  const update = async (body: Record<string, unknown>) => {
    const { canvasContractRouter } = await import('./canvasContractRouter.js');
    return (
      canvasContractRouter.update as unknown as (a: unknown) => Promise<{
        status: number;
        body: Record<string, unknown>;
      }>
    )({ req, params: { id: 'c1' }, body });
  };

  beforeEach(() => {
    updateCanvas.mockReset().mockResolvedValue({ kind: 'ok' });
  });

  it('sets a format of the same category', async () => {
    const res = await update({ format: 'post-portrait-tall' });
    expect(res.status).toBe(200);
    expect(updateCanvas).toHaveBeenCalledWith('c1', 'user-1', { format: 'post-portrait-tall' });
  });

  it('answers a category change with 400 like resize', async () => {
    updateCanvas.mockResolvedValue({ kind: 'category_mismatch' });
    const res = await update({ format: 'print-a3-hoch' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(CATEGORY_ERROR);
  });
});

describe('canvas.create', () => {
  const create = async (body: Record<string, unknown>) => {
    const { canvasContractRouter } = await import('./canvasContractRouter.js');
    return (
      canvasContractRouter.create as unknown as (a: unknown) => Promise<{
        status: number;
        body: unknown;
      }>
    )({ req, body });
  };
  const pages = [{ id: 'seed-0', configId: 'freeform', state: {} }];

  beforeEach(() => {
    createCanvas.mockReset().mockResolvedValue({ id: 'c1' });
    seedCanvasPages.mockReset().mockResolvedValue(undefined);
    getServerFormat.mockReset();
  });

  it('creates a canvas in a known print format', async () => {
    getServerFormat.mockReturnValue({ id: 'print-a3-hoch' });
    const res = await create({
      template_type: 'freeform',
      format: 'print-a3-hoch',
      initial_state: { pages },
    });
    expect(res.status).toBe(201);
    expect(createCanvas).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ format: 'print-a3-hoch' })
    );
  });

  it('rejects an unknown print format', async () => {
    getServerFormat.mockReturnValue(null);
    const res = await create({ template_type: 'freeform', format: 'print-a0-quer' });
    expect(res.status).toBe(400);
    expect(createCanvas).not.toHaveBeenCalled();
  });

  it('rejects a print format with a non-freeform template type', async () => {
    getServerFormat.mockReturnValue({ id: 'print-a3-hoch' });
    const res = await create({ template_type: 'zitat', format: 'print-a3-hoch' });
    expect(res.status).toBe(400);
    expect(createCanvas).not.toHaveBeenCalled();
  });

  it('accepts freeform-at for a print format', async () => {
    getServerFormat.mockReturnValue({ id: 'print-a3-hoch' });
    const res = await create({ template_type: 'freeform-at', format: 'print-a3-hoch' });
    expect(res.status).toBe(201);
  });

  it('lets an unknown digital id through, it renders as the default', async () => {
    getServerFormat.mockReturnValue(null);
    const res = await create({ template_type: 'freeform', format: 'story' });
    expect(res.status).toBe(201);
  });
});

describe('canvas reads redact the collaborator list', () => {
  const canvas = {
    id: 'c1',
    title: 'Busse statt Stau',
    created_by: 'owner-1',
    permissions: {
      'user-1': { level: 'viewer', granted_at: '2026-10-16T00:00:00Z' },
      'other-3': { level: 'editor', granted_at: '2026-10-16T00:00:00Z' },
    },
  };

  type Handler = (a: unknown) => Promise<{ status: number; body: unknown }>;
  const router = async () => (await import('./canvasContractRouter.js')).canvasContractRouter;

  it('opens via link and hands a viewer only their own entry', async () => {
    getCanvas.mockReset().mockResolvedValue({ kind: 'ok', canvas });
    const res = await ((await router()).get as unknown as Handler)({
      req,
      params: { id: 'c1' },
    });
    expect(getCanvas).toHaveBeenCalledWith('c1', 'user-1', { joinViaLink: true });
    expect((res.body as typeof canvas).permissions).toEqual({
      'user-1': canvas.permissions['user-1'],
    });
  });

  it('does the same for the canvas list', async () => {
    listCanvases.mockReset().mockResolvedValue([canvas]);
    const res = await ((await router()).list as unknown as Handler)({ req });
    expect((res.body as (typeof canvas)[])[0]?.permissions).toEqual({
      'user-1': canvas.permissions['user-1'],
    });
  });
});
