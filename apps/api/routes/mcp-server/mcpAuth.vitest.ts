/**
 * Die stille Null-Scope-Falle.
 *
 * `api_keys.scopes.permissions` kennt genau zwei Werte — `notebooks:read` und
 * `chat:completions` — und `MCP_SCOPES` keinen davon. Der frühere Filter
 * `perms.filter(p => MCP_SCOPES.includes(p))` ergab damit für JEDEN
 * existierenden Schlüssel die leere Menge: die Anmeldung gelang, der Server
 * baute sich ohne ein einziges Werkzeug ausser `whoami`, und nichts davon war
 * ein Fehler, den irgendwer gesehen hätte.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const verifyApiKey = vi.fn();

vi.mock('../../middleware/apiKeyMiddleware.js', () => ({
  extractBearer: (req: { headers: Record<string, string> }) =>
    req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? null,
  verifyApiKey: (...a: unknown[]) => verifyApiKey(...a),
}));

vi.mock('../../config/betterAuth.js', () => ({
  auth: { api: { getMcpSession: vi.fn().mockResolvedValue(null) } },
}));

const { resolveMcpAuth } = await import('./mcpAuth.js');

const request = (token: string) => ({ headers: { authorization: `Bearer ${token}` } }) as never;

const keyContext = (scopes: Record<string, unknown>) => ({
  ok: true,
  ctx: { id: 'key-1', userId: 'user-1', scopes, rateLimitPerMinute: 30 },
});

beforeEach(() => verifyApiKey.mockReset());

describe('resolveMcpAuth — Berechtigungen eines Schlüssels', () => {
  it('öffnet mit notebooks:read die Suche statt gar nichts', async () => {
    verifyApiKey.mockResolvedValue(keyContext({ permissions: ['notebooks:read'] }));
    const ctx = await resolveMcpAuth(request('gru_abc'));
    expect(ctx?.scopes.has('search')).toBe(true);
  });

  it('nimmt einen direkt vergebenen MCP-Scope weiterhin an', async () => {
    verifyApiKey.mockResolvedValue(keyContext({ permissions: ['content:read'] }));
    const ctx = await resolveMcpAuth(request('gru_abc'));
    expect(ctx?.scopes.has('content:read')).toBe(true);
  });

  it('gibt chat:completions keinen MCP-Scope — der Schlüssel ist fürs Add-in', async () => {
    verifyApiKey.mockResolvedValue(keyContext({ permissions: ['chat:completions'] }));
    const ctx = await resolveMcpAuth(request('gru_abc'));
    expect([...(ctx?.scopes ?? [])]).toEqual([]);
  });

  it('behält * als Freibrief über alle MCP-Scopes', async () => {
    verifyApiKey.mockResolvedValue(keyContext({ permissions: ['*'] }));
    const ctx = await resolveMcpAuth(request('gru_abc'));
    expect(ctx?.scopes.has('search')).toBe(true);
    expect(ctx?.scopes.has('media:write')).toBe(true);
  });
});

describe('resolveMcpAuth — Landesverbände und Kontingent', () => {
  it('reicht Schlüssel-Id, Landesverbände und Kontingent durch', async () => {
    verifyApiKey.mockResolvedValue(
      keyContext({ permissions: ['notebooks:read'], landesverbaende: ['HH', 'BY'] })
    );
    const ctx = await resolveMcpAuth(request('gru_abc'));
    expect(ctx?.apiKey).toEqual({
      id: 'key-1',
      landesverbaende: ['HH', 'BY'],
      rateLimitPerMinute: 30,
    });
  });

  it('lässt landesverbaende undefiniert, wenn der Schlüssel keine trägt', async () => {
    verifyApiKey.mockResolvedValue(keyContext({ permissions: ['chat:completions'] }));
    const ctx = await resolveMcpAuth(request('gru_abc'));
    expect(ctx?.apiKey?.landesverbaende).toBeUndefined();
  });

  it('gibt einer OAuth-Sitzung keinen apiKey-Block', async () => {
    const ctx = await resolveMcpAuth(request('nicht-gru-token'));
    expect(ctx).toBeNull();
  });
});
