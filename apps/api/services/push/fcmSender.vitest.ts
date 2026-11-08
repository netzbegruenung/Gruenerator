/**
 * FCM-v1-Draht ohne Netz: nur Daten (sonst zeigt Android die Meldung ohne
 * Entschlüsselung an), OAuth-Token einmal geholt, UNREGISTERED löscht.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const account = vi.hoisted(() => {
  const { generateKeyPairSync } = require('node:crypto') as typeof import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const json = JSON.stringify({
    project_id: 'gruenerator-push',
    client_email: 'push@gruenerator-push.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  });
  return Buffer.from(json).toString('base64');
});

vi.mock('../../config/env.js', () => ({ env: { FCM_SERVICE_ACCOUNT_JSON_BASE64: account } }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { sendFcm } = await import('./fcmSender.js');

let sendReply: { status: number; body: unknown } = { status: 200, body: { name: 'm1' } };
const fetchMock = vi.fn(async (url: string, _init: RequestInit) => {
  if (url === 'https://oauth2.googleapis.com/token') {
    return new Response(JSON.stringify({ access_token: 'ya29.token', expires_in: 3599 }));
  }
  return new Response(JSON.stringify(sendReply.body), { status: sendReply.status });
});

beforeEach(() => {
  sendReply = { status: 200, body: { name: 'm1' } };
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const message = {
  token: 'fcm-token',
  priority: 'high' as const,
  sealed: 'U0VBTEVE',
  ttlSeconds: 86400,
};
const sends = () =>
  fetchMock.mock.calls.filter(([url]) => url.startsWith('https://fcm.googleapis.com/'));

describe('sendFcm', () => {
  it('sends a data-only message with priority and TTL', async () => {
    await expect(sendFcm(message)).resolves.toEqual({ ok: true });
    const [[url, init]] = sends();
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/gruenerator-push/messages:send');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer ya29.token');
    expect(JSON.parse(init.body as string)).toEqual({
      message: {
        token: 'fcm-token',
        data: { gp: 'U0VBTEVE' },
        android: { priority: 'HIGH', ttl: '86400s' },
      },
    });
  });

  it('fetches the OAuth token once for many sends', async () => {
    await Promise.all([sendFcm(message), sendFcm({ ...message, priority: 'normal' })]);
    await sendFcm(message);
    const tokenCalls = fetchMock.mock.calls.filter(([url]) => url.includes('oauth2'));
    expect(tokenCalls.length).toBeLessThanOrEqual(1);
    expect(JSON.parse(sends()[1][1].body as string).message.android.priority).toBe('NORMAL');
  });

  it('flags UNREGISTERED tokens for removal, other errors not', async () => {
    sendReply = {
      status: 404,
      body: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } },
    };
    await expect(sendFcm(message)).resolves.toEqual({
      ok: false,
      status: 404,
      reason: 'UNREGISTERED',
      unregistered: true,
    });
    sendReply = { status: 503, body: { error: { status: 'UNAVAILABLE' } } };
    await expect(sendFcm(message)).resolves.toMatchObject({ ok: false, unregistered: false });
  });
});
