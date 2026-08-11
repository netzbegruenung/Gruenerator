/**
 * Die Anmeldeprüfung für WebSocket-Upgrades.
 *
 * Anlass ist ein Befund aus dem Review zu #2498: `/api/voice/realtime` nahm
 * jede anonyme Verbindung an und streamte Audio auf unseren Kosten an die
 * Realtime-Transkription — der Upgrade-Handler hängt am HTTP-Server, nicht an
 * Express, und sah `requireAuth` deshalb nie.
 *
 * Festgehalten wird deshalb vor allem die Richtung der Fehlerfälle: alles, was
 * keine eindeutig gültige Sitzung ist, schließt den Kanal. Bei einer gestörten
 * Sitzungsauflösung ist das die umgekehrte Entscheidung zu `requireAiConsent`
 * (das bei einem DB-Fehler durchlässt) — dort ginge es um eine zweite
 * Verteidigungslinie, hier um die einzige.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IncomingMessage } from 'node:http';

const getSessionMock = vi.fn();
const hasAiConsentMock = vi.fn();

vi.mock('../config/betterAuth.js', () => ({
  auth: { api: { getSession: getSessionMock } },
}));

vi.mock('./requireAiConsent.js', () => ({
  hasAiConsent: hasAiConsentMock,
}));

const envMock = {
  NODE_ENV: 'production' as 'development' | 'production' | 'test',
  ALLOW_DEV_AUTH_BYPASS: false,
  DEV_AUTH_BYPASS_TOKEN: null as string | null,
};

vi.mock('../config/env.js', () => ({
  get env() {
    return envMock;
  },
}));

const { resolveUpgradeAuth, denyUpgrade } = await import('./resolveUpgradeAuth.js');

const request = (cookie?: string): IncomingMessage =>
  ({ headers: cookie ? { cookie } : {} }) as unknown as IncomingMessage;

const url = (search = ''): URL => new URL(`http://localhost/api/voice/realtime${search}`);

describe('resolveUpgradeAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.NODE_ENV = 'production';
    envMock.ALLOW_DEV_AUTH_BYPASS = false;
    envMock.DEV_AUTH_BYPASS_TOKEN = null;
    hasAiConsentMock.mockResolvedValue(true);
  });

  it('weist eine Verbindung ohne Sitzung ab', async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(resolveUpgradeAuth(request(), url())).resolves.toEqual({
      ok: false,
      reason: 'unauthorized',
    });
  });

  it('lässt eine gültige Sitzung mit Einwilligung durch', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'user-1' } });
    await expect(resolveUpgradeAuth(request('ba.session_token=x'), url())).resolves.toEqual({
      ok: true,
      userId: 'user-1',
    });
  });

  it('weist eine gültige Sitzung ohne Einwilligung eigens ab', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'user-1' } });
    hasAiConsentMock.mockResolvedValue(false);
    await expect(resolveUpgradeAuth(request('ba.session_token=x'), url())).resolves.toEqual({
      ok: false,
      reason: 'consent_required',
    });
  });

  it('schließt den Kanal, wenn die Sitzungsauflösung stört', async () => {
    getSessionMock.mockRejectedValue(new Error('redis weg'));
    await expect(resolveUpgradeAuth(request('ba.session_token=x'), url())).resolves.toEqual({
      ok: false,
      reason: 'unauthorized',
    });
  });

  describe('Dev-Bypass', () => {
    // Über die Abfrage statt über die Kopfzeile: `new WebSocket()` kann
    // `x-dev-auth-bypass` nicht setzen.
    it('greift in development mit passendem Token', async () => {
      envMock.NODE_ENV = 'development';
      envMock.ALLOW_DEV_AUTH_BYPASS = true;
      envMock.DEV_AUTH_BYPASS_TOKEN = 'geheim';
      const result = await resolveUpgradeAuth(request(), url('?dev_auth_token=geheim'));
      expect(result.ok).toBe(true);
      expect(getSessionMock).not.toHaveBeenCalled();
    });

    it('greift in production auch mit passendem Token nicht', async () => {
      envMock.ALLOW_DEV_AUTH_BYPASS = true;
      envMock.DEV_AUTH_BYPASS_TOKEN = 'geheim';
      getSessionMock.mockResolvedValue(null);
      await expect(resolveUpgradeAuth(request(), url('?dev_auth_token=geheim'))).resolves.toEqual({
        ok: false,
        reason: 'unauthorized',
      });
    });

    it('greift mit falschem Token nicht', async () => {
      envMock.NODE_ENV = 'development';
      envMock.ALLOW_DEV_AUTH_BYPASS = true;
      envMock.DEV_AUTH_BYPASS_TOKEN = 'geheim';
      getSessionMock.mockResolvedValue(null);
      await expect(resolveUpgradeAuth(request(), url('?dev_auth_token=falsch'))).resolves.toEqual({
        ok: false,
        reason: 'unauthorized',
      });
    });
  });
});

describe('denyUpgrade', () => {
  function socket() {
    const written: string[] = [];
    return {
      written,
      write: (chunk: string) => written.push(chunk),
      destroy: vi.fn(),
    };
  }

  it('antwortet mit 401 und schließt', () => {
    const s = socket();
    denyUpgrade(s as never, 'unauthorized');
    expect(s.written[0]).toContain('401 Unauthorized');
    expect(s.destroy).toHaveBeenCalled();
  });

  // 403, nicht 401 — dieselbe Unterscheidung wie im HTTP-Pfad: die Sitzung
  // gilt, es fehlt nur die Einwilligung.
  it('antwortet bei fehlender Einwilligung mit 403 und schließt', () => {
    const s = socket();
    denyUpgrade(s as never, 'consent_required');
    expect(s.written[0]).toContain('403 Forbidden');
    expect(s.destroy).toHaveBeenCalled();
  });
});
