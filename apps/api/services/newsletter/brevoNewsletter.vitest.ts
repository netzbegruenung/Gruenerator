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

import { isNewsletterSubscriber } from './brevoNewsletter.js';

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
