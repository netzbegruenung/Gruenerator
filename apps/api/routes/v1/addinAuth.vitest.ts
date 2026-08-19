/**
 * Der Endpunkt hat ab jetzt zwei Türen. Was zählt, ist dass keine der beiden
 * die andere aufmacht:
 *
 *   • ein OAuth-Token bekommt genau die freigegebenen Scopes — kein `*`,
 *   • ein Schlüssel ohne `gru_`-Präfix funktioniert weiter (der Endpunkt hat
 *     nie einen Präfix verlangt),
 *   • ein `gru_`-Schlüssel fasst den OAuth-Pfad gar nicht erst an,
 *   • ein ungültiger Bearer bekommt 401 **mit** `WWW-Authenticate`, sonst
 *     findet ein OAuth-Client den Einstieg nicht.
 */

import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Die Zeile, die `verifyApiKey` in der Datenbank findet; null = kein Treffer. */
let apiKeyRow: Record<string, unknown> | null = null;

vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(apiKeyRow ? [apiKeyRow] : []) }),
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  }),
}));

/**
 * Was die Token-Prüfung liefert; null = Token ungültig oder keins dabei.
 *
 * Seit better-auth 1.7 gibt es keine `getMcpSession` mehr: das Zugriffstoken
 * ist ein signiertes JWT und wird gegen die JWKS geprüft. Der Rückgabewert ist
 * deshalb kein Sitzungsobjekt, sondern die geprüften Claims — die Scopes als
 * Menge, wie `verifyOAuthResourceRequest` sie aufbereitet.
 */
let oauthClaims: { userId: string; scopes: string } | null = null;
const verifyOAuthResourceRequest = vi.fn(() =>
  Promise.resolve(
    oauthClaims === null
      ? null
      : {
          userId: oauthClaims.userId,
          scopes: new Set(oauthClaims.scopes.split(' ').filter(Boolean)),
          clientId: 'test-client',
        }
  )
);

vi.mock('../../services/auth/verifyOAuthResourceRequest.js', () => ({
  verifyOAuthResourceRequest: (...a: unknown[]) => verifyOAuthResourceRequest(...(a as [])),
}));

const { requireAddinAuth, contextFromOAuthSession } = await import('./addinAuth.js');

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  const app = express();
  app.use('/probe', requireAddinAuth, (req, res) => {
    res.status(200).json({ apiKey: req.apiKey });
  });

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  apiKeyRow = null;
  oauthClaims = null;
  verifyOAuthResourceRequest.mockClear();
});

function probe(authorization?: string): Promise<Response> {
  return fetch(`${baseUrl}/probe`, {
    headers: authorization ? { Authorization: authorization } : {},
  });
}

describe('contextFromOAuthSession', () => {
  it('übernimmt genau die freigegebenen Scopes', () => {
    const ctx = contextFromOAuthSession('user-1', 'chat:completions offline_access');
    expect(ctx.scopes.permissions).toEqual(['chat:completions', 'offline_access']);
  });

  it('filtert das Sternchen heraus, statt es durchzureichen', () => {
    // `assertScope` behandelt `*` als Freibrief für jeden Scope. Unser Server
    // stellt es heute nicht aus — aber darauf zu bauen hiesse, die Prüfung an
    // eine Zusicherung zu hängen, die dieses Modul nicht geben kann.
    const ctx = contextFromOAuthSession('user-1', 'chat:completions * groups:write');
    expect(ctx.scopes.permissions).toEqual(['chat:completions', 'groups:write']);
    expect(ctx.id).toBe('oauth:user-1');
  });

  it('begrenzt pro Konto, nicht pro Token', () => {
    // Sonst umginge man die Begrenzung durch wiederholtes Anmelden.
    expect(contextFromOAuthSession('user-1', '').id).toBe(
      contextFromOAuthSession('user-1', 'chat:completions').id
    );
  });

  it('lässt die Begrenzung auf den Vorgabewert fallen', () => {
    expect(contextFromOAuthSession('user-1', '').rateLimitPerMinute).toBeNull();
  });
});

describe('requireAddinAuth', () => {
  it('weist eine Anfrage ohne Bearer ab', async () => {
    expect((await probe()).status).toBe(401);
  });

  it('lässt ein gültiges OAuth-Token durch', async () => {
    oauthClaims = { userId: 'user-1', scopes: 'chat:completions offline_access' };

    const res = await probe('Bearer oauth-token');
    expect(res.status).toBe(200);

    const body = (await res.json()) as { apiKey: { userId: string; id: string } };
    expect(body.apiKey.userId).toBe('user-1');
    expect(body.apiKey.id).toBe('oauth:user-1');
  });

  it('nimmt für einen gru_-Schlüssel den OAuth-Pfad gar nicht erst', async () => {
    apiKeyRow = {
      id: 'key-1',
      user_id: 'user-2',
      scopes: { permissions: ['chat:completions'] },
      rate_limit_per_minute: null,
      revoked_at: null,
      expires_at: null,
    };

    const res = await probe('Bearer gru_abc');

    expect(res.status).toBe(200);
    expect(verifyOAuthResourceRequest).not.toHaveBeenCalled();
  });

  it('akzeptiert weiterhin einen Schlüssel ohne Präfix', async () => {
    // Der Endpunkt hat nie einen Präfix verlangt. Diesen Vertrag unter der
    // Überschrift „OAuth ergänzt" zu verengen würde Schlüssel ungültig machen,
    // die heute funktionieren.
    apiKeyRow = {
      id: 'key-2',
      user_id: 'user-3',
      scopes: { permissions: ['chat:completions'] },
      rate_limit_per_minute: null,
      revoked_at: null,
      expires_at: null,
    };

    const res = await probe('Bearer altschluessel-ohne-praefix');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { apiKey: { userId: string } };
    expect(body.apiKey.userId).toBe('user-3');
  });

  it('meldet einen zurückgezogenen Schlüssel als solchen, statt ihn zu verschweigen', async () => {
    apiKeyRow = {
      id: 'key-3',
      user_id: 'user-4',
      scopes: {},
      rate_limit_per_minute: null,
      revoked_at: new Date(),
      expires_at: null,
    };

    const res = await probe('Bearer altschluessel-zurueckgezogen');

    expect(res.status).toBe(401);
    expect((await res.json()) as { error: string }).toEqual({ error: 'API key revoked' });
  });

  it('weist einen unbekannten Bearer mit WWW-Authenticate ab', async () => {
    const res = await probe('Bearer weder-token-noch-schluessel');

    expect(res.status).toBe(401);
    // Ohne diesen Header raten OAuth-Clients, wo sie sich einen Token holen.
    expect(res.headers.get('WWW-Authenticate')).toMatch(/oauth-protected-resource/);
  });

  it('fällt auf den Schlüsselpfad zurück, wenn der Auth-Stack wirft', async () => {
    verifyOAuthResourceRequest.mockRejectedValueOnce(new Error('Auth-Stack nicht verfügbar'));
    apiKeyRow = {
      id: 'key-4',
      user_id: 'user-5',
      scopes: { permissions: ['chat:completions'] },
      rate_limit_per_minute: null,
      revoked_at: null,
      expires_at: null,
    };

    expect((await probe('Bearer altschluessel')).status).toBe(200);
  });
});
