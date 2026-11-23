/**
 * Unit tests für die Brevo-Abo-Abfrage.
 *
 * Die Invariante, auf die es ankommt: ein Brevo-Ausfall darf nie zu einer
 * zwischengespeicherten Antwort führen. „Nicht abonniert" wird gemerkt,
 * „konnte nicht fragen" nicht — sonst hinge eine Person nach einem 30-Sekunden-
 * Ausfall zwölf Stunden am falschen Status fest.
 *
 * fetch, env, Profil, Cache und Logger sind gemockt (hermetisch).
 *
 * Run: `npx vitest run apps/api/services/newsletter/brevoNewsletter.vitest.ts`
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';

const { envMock, getProfileByIdMock } = vi.hoisted(() => ({
  envMock: { BREVO_API_KEY: 'xkeysib-test' as string | undefined },
  getProfileByIdMock: vi.fn(),
}));

vi.mock('../../config/env.js', () => ({ env: envMock }));

vi.mock('../../utils/redis/jsonCache.js', () => ({
  getCachedJson: vi.fn(async () => null),
  setCachedJson: vi.fn(async () => undefined),
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../user/ProfileService.js', () => ({
  getProfileService: () => ({ getProfileById: getProfileByIdMock }),
}));

import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';

import { isNewsletterSubscriber, subscribeToNewsletter } from './brevoNewsletter.js';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const brevoContact = (listIds: number[], emailBlacklisted = false) => ({
  ok: true,
  status: 200,
  json: async () => ({ email: 'a@b.de', listIds, emailBlacklisted }),
});

beforeEach(() => {
  vi.clearAllMocks();
  envMock.BREVO_API_KEY = 'xkeysib-test';
  getProfileByIdMock.mockResolvedValue({ id: 'u1', email: 'a@b.de' });
  vi.mocked(getCachedJson).mockResolvedValue(null);
});

describe('isNewsletterSubscriber', () => {
  it('meldet true, wenn der Kontakt in Liste 5 steht', async () => {
    fetchMock.mockResolvedValue(brevoContact([5, 12]));
    await expect(isNewsletterSubscriber('u1')).resolves.toBe(true);
  });

  it('meldet false, wenn der Kontakt andere Listen, aber nicht 5 hat', async () => {
    fetchMock.mockResolvedValue(brevoContact([9, 12]));
    await expect(isNewsletterSubscriber('u1')).resolves.toBe(false);
  });

  it('meldet false für einen Kontakt auf der Blockliste, auch in Liste 5', async () => {
    fetchMock.mockResolvedValue(brevoContact([5], true));
    await expect(isNewsletterSubscriber('u1')).resolves.toBe(false);
  });

  it('schickt den Schlüssel im api-key-Header und kodiert die Adresse', async () => {
    getProfileByIdMock.mockResolvedValue({ id: 'u1', email: 'a+b@c.de' });
    fetchMock.mockResolvedValue(brevoContact([5]));
    await isNewsletterSubscriber('u1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/contacts/a%2Bb%40c.de');
    expect(init.headers['api-key']).toBe('xkeysib-test');
  });

  // ── Auskünfte werden gemerkt ──────────────────────────────────────────────

  it('merkt sich ein abonniert/nicht-abonniert', async () => {
    fetchMock.mockResolvedValue(brevoContact([5]));
    await isNewsletterSubscriber('u1');
    expect(setCachedJson).toHaveBeenCalledWith('newsletter_sub:u1', { subscribed: true }, 43200);
  });

  it('behandelt 404 als Auskunft „kennt Brevo nicht" und merkt sie', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await expect(isNewsletterSubscriber('u1')).resolves.toBe(false);
    expect(setCachedJson).toHaveBeenCalledWith('newsletter_sub:u1', { subscribed: false }, 43200);
  });

  it('antwortet aus dem Cache, ohne Brevo zu fragen', async () => {
    vi.mocked(getCachedJson).mockResolvedValue({ subscribed: true });
    await expect(isNewsletterSubscriber('u1')).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ── Ausfälle werden NICHT gemerkt ─────────────────────────────────────────

  it('merkt sich einen 500er nicht', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(isNewsletterSubscriber('u1')).resolves.toBe(false);
    expect(setCachedJson).not.toHaveBeenCalled();
  });

  it('merkt sich einen Netzfehler/Timeout nicht', async () => {
    fetchMock.mockRejectedValue(new Error('TimeoutError'));
    await expect(isNewsletterSubscriber('u1')).resolves.toBe(false);
    expect(setCachedJson).not.toHaveBeenCalled();
  });

  it('merkt sich eine unerwartete Antwortform nicht', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ listIds: 'fünf' }) });
    await expect(isNewsletterSubscriber('u1')).resolves.toBe(false);
    expect(setCachedJson).not.toHaveBeenCalled();
  });

  // ── Gar nicht erst fragen ─────────────────────────────────────────────────

  it('fragt ohne API-Schlüssel nicht an', async () => {
    envMock.BREVO_API_KEY = undefined;
    await expect(isNewsletterSubscriber('u1')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fragt ohne Profil-E-Mail nicht an', async () => {
    getProfileByIdMock.mockResolvedValue({ id: 'u1', email: null });
    await expect(isNewsletterSubscriber('u1')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fragt ohne userId nicht an', async () => {
    await expect(isNewsletterSubscriber('')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('subscribeToNewsletter', () => {
  const REDIRECT = 'https://app.test/start/arbeiten?newsletter=bestaetigt';
  const notSubscribed = { ok: false, status: 404, json: async () => ({}) };
  const created = { ok: true, status: 201, json: async () => ({}) };

  it('meldet already_subscribed und ruft Brevo nicht zum Anmelden', async () => {
    fetchMock.mockResolvedValueOnce(brevoContact([5]));
    await expect(subscribeToNewsletter('u1', REDIRECT)).resolves.toEqual({
      status: 'already_subscribed',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/v3/contacts/a%40b.de');
  });

  it('schickt das Double-Opt-In mit genau diesem Body', async () => {
    getProfileByIdMock.mockResolvedValue({
      id: 'u1',
      email: 'a@b.de',
      first_name: ' Anna ',
      last_name: 'Grün',
    });
    fetchMock.mockResolvedValueOnce(notSubscribed).mockResolvedValueOnce(created);

    await expect(subscribeToNewsletter('u1', REDIRECT)).resolves.toEqual({
      status: 'confirmation_sent',
    });

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://api.brevo.com/v3/contacts/doubleOptinConfirmation');
    expect(init.method).toBe('POST');
    expect(init.headers['api-key']).toBe('xkeysib-test');
    expect(JSON.parse(init.body)).toEqual({
      email: 'a@b.de',
      attributes: { VORNAME: 'Anna', NACHNAME: 'Grün' },
      includeListIds: [5],
      templateId: 1,
      redirectionUrl: REDIRECT,
    });
  });

  it('lässt leere Namen weg', async () => {
    getProfileByIdMock.mockResolvedValue({
      id: 'u1',
      email: 'a@b.de',
      first_name: '',
      last_name: null,
    });
    fetchMock.mockResolvedValueOnce(notSubscribed).mockResolvedValueOnce(created);
    await subscribeToNewsletter('u1', REDIRECT);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).attributes).toEqual({});
  });

  it('meldet no_email ohne Brevo anzufragen', async () => {
    getProfileByIdMock.mockResolvedValue({ id: 'u1', email: null });
    await expect(subscribeToNewsletter('u1', REDIRECT)).resolves.toEqual({
      status: 'error',
      code: 'no_email',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('meldet not_configured ohne API-Schlüssel', async () => {
    envMock.BREVO_API_KEY = undefined;
    await expect(subscribeToNewsletter('u1', REDIRECT)).resolves.toEqual({
      status: 'error',
      code: 'not_configured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('meldet brevo_failed bei Fehlerstatus, nie Erfolg', async () => {
    fetchMock
      .mockResolvedValueOnce(notSubscribed)
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) });
    await expect(subscribeToNewsletter('u1', REDIRECT)).resolves.toEqual({
      status: 'error',
      code: 'brevo_failed',
    });
  });

  it('meldet brevo_failed, wenn Brevo nicht erreichbar ist', async () => {
    fetchMock.mockResolvedValueOnce(notSubscribed).mockRejectedValueOnce(new Error('timeout'));
    await expect(subscribeToNewsletter('u1', REDIRECT)).resolves.toEqual({
      status: 'error',
      code: 'brevo_failed',
    });
  });
});

describe('subscribeToNewsletter mit eingegebener Adresse', () => {
  it('nutzt die Adresse aus dem Dialog und fragt Brevo direkt nach ihrem Abo', async () => {
    getProfileByIdMock.mockResolvedValue({ id: 'u1', email: 'a@b.de', first_name: 'Anna' });
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) });

    const result = await subscribeToNewsletter('u1', 'https://x/start', 'privat@example.org');

    expect(result).toEqual({ status: 'confirmation_sent' });
    expect(String(fetchMock.mock.calls[0][0])).toContain(encodeURIComponent('privat@example.org'));
    const body = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(body.email).toBe('privat@example.org');
    expect(body.attributes).toEqual({ VORNAME: 'Anna' });
  });

  it('meldet „schon abonniert" für eine andere Adresse, die in Liste 5 steht', async () => {
    fetchMock.mockResolvedValueOnce(brevoContact([5]));
    const result = await subscribeToNewsletter('u1', 'https://x/start', 'privat@example.org');
    expect(result).toEqual({ status: 'already_subscribed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
