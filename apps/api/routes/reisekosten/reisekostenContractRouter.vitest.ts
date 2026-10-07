/**
 * The handlers' boundaries: every call is scoped to the authenticated user, a
 * row the service does not find answers 404, a missing form 503, and a failed
 * extraction 500 without leaking the error.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const svc = {
  listAbrechnungen: vi.fn(),
  getAbrechnung: vi.fn(),
  createAbrechnung: vi.fn(),
  updateAbrechnung: vi.fn(),
  trashAbrechnung: vi.fn(),
};
const getFormular = vi.fn();
const extractBeleg = vi.fn();

vi.mock('../../services/reisekosten/abrechnungService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...svc,
}));
vi.mock('../../services/reisekosten/formularService.js', () => ({ getFormular }));
vi.mock('./extractService.js', () => ({ extractBeleg }));

const { reisekostenContractRouter: r } = await import('./reisekostenContractRouter.js');

const req = { user: { id: 'user-1' } } as never;
const ROW = {
  id: '22222222-2222-4222-8222-222222222222',
  user_id: 'user-1',
  slug_suffix: 'Ab3xK9',
  titel: 'Parteitag',
  status: 'entwurf',
  state: {},
  belege: [],
  created_at: new Date('2026-10-01'),
  updated_at: new Date('2026-10-01'),
  deleted_at: null,
};

beforeEach(() => {
  for (const fn of [...Object.values(svc), getFormular, extractBeleg]) fn.mockReset();
});

describe('Abrechnungen', () => {
  it('lists for the authenticated user', async () => {
    svc.listAbrechnungen.mockResolvedValue([ROW]);
    const res = await r.listAbrechnungen({ req } as never);
    expect(svc.listAbrechnungen).toHaveBeenCalledWith('user-1');
    expect(res.status).toBe(200);
    expect((res.body as { abrechnungen: Array<{ slug: string }> }).abrechnungen[0]?.slug).toBe(
      'parteitag-Ab3xK9'
    );
  });

  it('answers 404 for a row the user does not own', async () => {
    svc.getAbrechnung.mockResolvedValue(null);
    const res = await r.getAbrechnung({ req, params: { idOrSlug: 'x-Ab3xK9' } } as never);
    expect(svc.getAbrechnung).toHaveBeenCalledWith('user-1', 'x-Ab3xK9');
    expect(res.status).toBe(404);
  });

  it('creates with 201', async () => {
    svc.createAbrechnung.mockResolvedValue(ROW);
    const res = await r.createAbrechnung({ req, body: { state: {} } } as never);
    expect(svc.createAbrechnung).toHaveBeenCalledWith('user-1', {});
    expect(res.status).toBe(201);
  });

  it('answers 404 when an update or delete hits no own row', async () => {
    svc.updateAbrechnung.mockResolvedValue(null);
    svc.trashAbrechnung.mockResolvedValue(false);
    const params = { idOrSlug: ROW.id };
    expect((await r.updateAbrechnung({ req, params, body: {} } as never)).status).toBe(404);
    expect((await r.deleteAbrechnung({ req, params } as never)).status).toBe(404);
  });

  it('deletes into the Papierkorb', async () => {
    svc.trashAbrechnung.mockResolvedValue(true);
    const res = await r.deleteAbrechnung({ req, params: { idOrSlug: ROW.id } } as never);
    expect(svc.trashAbrechnung).toHaveBeenCalledWith('user-1', ROW.id);
    expect(res).toEqual({ status: 200, body: { success: true } });
  });
});

describe('formular', () => {
  it('answers 503 when the form is not deployed', async () => {
    getFormular.mockResolvedValue(null);
    const res = await r.formular({ req, params: { rateKey: 'de-DE/nrw' } } as never);
    expect(res.status).toBe(503);
  });
});

describe('extractBeleg', () => {
  it('answers 500 without the underlying message', async () => {
    extractBeleg.mockRejectedValue(new Error('provider said: Rechnung 64,90'));
    const res = await r.extractBeleg({ req, body: { text: 't', filename: 'f' } } as never);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('64,90');
  });
});
