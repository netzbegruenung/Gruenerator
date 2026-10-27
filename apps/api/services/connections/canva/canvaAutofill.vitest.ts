/**
 * Autofill creates a NEW design and fills only what the source really has:
 * text fields by their exact name. Image, chart and sheet fields keep the
 * template's content, and the source design is never updated in place.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('./CanvaConnectionManager.js', () => ({
  CanvaConnectionManager: { getValidAccessToken: vi.fn(async () => 'token') },
}));

const client = {
  getUserCapabilities: vi.fn(),
  listBrandTemplates: vi.fn(),
  getDesignDataset: vi.fn(),
  getBrandTemplateDataset: vi.fn(),
  createAutofillJob: vi.fn(),
  getAutofillJob: vi.fn(),
};
vi.mock('../../api-clients/canvaClient.js', () => client);

const aiObject = vi.fn();
vi.mock('../../ai/generate.js', () => ({ aiObject: (...a: unknown[]) => aiObject(...a) }));

const { autofillDesign, getAutofillFields, getAutofillSources, suggestAutofillTexts } =
  await import('./canvaAutofill.js');

const DATASET = { TITEL: { type: 'text' }, DATUM: { type: 'text' }, BILD: { type: 'image' } };
const DONE = {
  id: 'job-1',
  status: 'success',
  result: { design: { title: 'Plakat', urls: { edit_url: 'https://canva.com/e' } } },
};

beforeEach(() => {
  vi.clearAllMocks();
  client.getDesignDataset.mockResolvedValue(DATASET);
  client.getBrandTemplateDataset.mockResolvedValue(DATASET);
  client.createAutofillJob.mockResolvedValue(DONE);
});

describe('autofillDesign', () => {
  it('sends only the text fields the design has, as a new design', async () => {
    const outcome = await autofillDesign('user-1', {
      source: { kind: 'design', id: 'DAF1' },
      texts: { TITEL: 'Klimaschutz jetzt', BILD: 'kein Text ins Bild', UNBEKANNT: 'x', DATUM: ' ' },
    });

    expect(outcome).toEqual({
      ok: true,
      value: {
        design: { title: 'Plakat', editUrl: 'https://canva.com/e', thumbnailUrl: null },
        trial: null,
      },
    });
    expect(client.createAutofillJob).toHaveBeenCalledWith('token', {
      source: { type: 'create_from_design', design_id: 'DAF1' },
      data: { TITEL: { type: 'text', text: 'Klimaschutz jetzt' } },
    });
  });

  it('starts a brand template as create_from_brand_template', async () => {
    await autofillDesign('user-1', {
      source: { kind: 'brand_template', id: 'BT1' },
      title: 'Infostand',
      texts: { TITEL: 'Infostand' },
    });

    expect(client.getBrandTemplateDataset).toHaveBeenCalledWith('token', 'BT1');
    expect(client.createAutofillJob).toHaveBeenCalledWith('token', {
      source: { type: 'create_from_brand_template', brand_template_id: 'BT1' },
      title: 'Infostand',
      data: { TITEL: { type: 'text', text: 'Infostand' } },
    });
  });

  it('starts no job when no text field is filled', async () => {
    const outcome = await autofillDesign('user-1', {
      source: { kind: 'design', id: 'DAF1' },
      texts: { BILD: 'x', TITEL: '' },
    });

    expect(outcome).toMatchObject({ ok: false, status: 400 });
    expect(client.createAutofillJob).not.toHaveBeenCalled();
  });

  it('waits for a running job and passes the trial information through', async () => {
    vi.useFakeTimers();
    client.createAutofillJob.mockResolvedValue({ id: 'job-1', status: 'in_progress' });
    client.getAutofillJob.mockResolvedValue({
      ...DONE,
      result: {
        ...DONE.result,
        trial_information: { uses_remaining: 2, upgrade_url: 'https://canva.com/pro' },
      },
    });

    const pending = autofillDesign('user-1', {
      source: { kind: 'design', id: 'DAF1' },
      texts: { TITEL: 'x' },
    });
    await vi.runAllTimersAsync();
    const outcome = await pending;
    vi.useRealTimers();

    expect(client.getAutofillJob).toHaveBeenCalledWith('token', 'job-1');
    expect(outcome.ok && outcome.value.trial).toEqual({
      usesRemaining: 2,
      upgradeUrl: 'https://canva.com/pro',
    });
  });

  it('reports a failed job instead of a design', async () => {
    client.createAutofillJob.mockResolvedValue({
      id: 'job-1',
      status: 'failed',
      error: { code: 'autofill_error', message: 'x' },
    });

    const outcome = await autofillDesign('user-1', {
      source: { kind: 'design', id: 'DAF1' },
      texts: { TITEL: 'x' },
    });

    expect(outcome).toMatchObject({ ok: false, status: 502 });
  });
});

describe('getAutofillFields', () => {
  it('marks only text fields as fillable', async () => {
    const { fields } = await getAutofillFields('user-1', { kind: 'design', id: 'DAF1' });

    expect(fields).toEqual([
      { name: 'TITEL', type: 'text', supported: true },
      { name: 'DATUM', type: 'text', supported: true },
      { name: 'BILD', type: 'image', supported: false },
    ]);
  });
});

describe('getAutofillSources', () => {
  it('lists brand templates only when the plan includes them', async () => {
    client.getUserCapabilities.mockResolvedValue(['autofill']);

    const sources = await getAutofillSources('user-1');

    expect(sources).toEqual({ canAutofill: true, canUseBrandTemplates: false, brandTemplates: [] });
    expect(client.listBrandTemplates).not.toHaveBeenCalled();
  });

  it('lists the brand templates with fields for a plan that has them', async () => {
    client.getUserCapabilities.mockResolvedValue(['autofill', 'brand_template']);
    client.listBrandTemplates.mockResolvedValue({
      items: [{ id: 'BT1', title: 'Infostand', thumbnail: { url: 'https://t' } }],
    });

    const sources = await getAutofillSources('user-1');

    expect(sources.brandTemplates).toEqual([
      { id: 'BT1', title: 'Infostand', thumbnailUrl: 'https://t' },
    ]);
  });
});

describe('suggestAutofillTexts', () => {
  it('asks only for the text fields, on the canva_autofill lane', async () => {
    aiObject.mockResolvedValue({ ok: true, data: { TITEL: 'Infostand', DATUM: '' } });

    const result = await suggestAutofillTexts(
      'user-1',
      { source: { kind: 'design', id: 'DAF1' }, prompt: 'Infostand am Marktplatz' },
      'de-DE'
    );

    expect(result).toEqual({ texts: { TITEL: 'Infostand', DATUM: '' } });
    const call = aiObject.mock.calls[0]![0] as {
      lane: string;
      schema: { properties: Record<string, unknown> };
      prompt: string;
    };
    expect(call.lane).toBe('canva_autofill');
    expect(Object.keys(call.schema.properties)).toEqual(['TITEL', 'DATUM']);
    expect(call.prompt).toContain('Infostand am Marktplatz');
  });

  it('keeps every field as a string and drops what the model invented', async () => {
    aiObject.mockResolvedValue({ ok: true, data: {} });
    await suggestAutofillTexts(
      'user-1',
      { source: { kind: 'design', id: 'DAF1' }, prompt: 'x' },
      'de-AT'
    );
    const { validate, system } = aiObject.mock.calls[0]![0] as {
      validate: (i: unknown) => unknown;
      system: string;
    };

    expect(validate({ TITEL: '  Klima ', DATUM: 3, EXTRA: 'nein' })).toEqual({
      ok: true,
      value: { TITEL: 'Klima', DATUM: '' },
    });
    expect(system).toContain('Österreich');
  });

  it('calls no model for a source without text fields', async () => {
    client.getDesignDataset.mockResolvedValue({ BILD: { type: 'image' } });

    const result = await suggestAutofillTexts(
      'user-1',
      { source: { kind: 'design', id: 'DAF1' }, prompt: 'x' },
      null
    );

    expect(result).toEqual({ texts: {} });
    expect(aiObject).not.toHaveBeenCalled();
  });
});
