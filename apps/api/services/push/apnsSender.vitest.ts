/**
 * APNs-Draht ohne Netz: Header, sichtbarer Ersatztext, und welche Antworten
 * eine Gerätezeile löschen dürfen.
 */
import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const keys = vi.hoisted(() => {
  const { generateKeyPairSync } = require('node:crypto') as typeof import('node:crypto');
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return { p8: Buffer.from(pem).toString('base64') };
});

vi.mock('../../config/env.js', () => ({
  env: { APNS_KEY_P8_BASE64: keys.p8, APNS_KEY_ID: 'KEY123', APNS_TEAM_ID: 'P74W7SGX8R' },
}));

interface FakeRequest extends EventEmitter {
  headers: Record<string, string>;
  body: string;
  setEncoding: () => void;
  setTimeout: () => void;
  close: () => void;
  end: (body: string) => void;
}

let reply: { status: number; body: string } = { status: 200, body: '' };
const requests: FakeRequest[] = [];
const connect = vi.fn((host: string) => {
  const session = Object.assign(new EventEmitter(), {
    host,
    closed: false,
    destroyed: false,
    setTimeout: vi.fn(),
    close: vi.fn(),
    request: (headers: Record<string, string>) => {
      const req = Object.assign(new EventEmitter(), {
        headers,
        body: '',
        setEncoding: () => {},
        setTimeout: () => {},
        close: () => {},
        end(this: FakeRequest, body: string) {
          this.body = body;
          queueMicrotask(() => {
            this.emit('response', { ':status': reply.status });
            if (reply.body) this.emit('data', reply.body);
            this.emit('end');
          });
        },
      }) as FakeRequest;
      requests.push(req);
      return req;
    },
  });
  return session;
});

vi.mock('node:http2', () => ({
  default: { connect, constants: { NGHTTP2_CANCEL: 8 } },
}));

const { sendApns, APNS_FALLBACK_ALERT } = await import('./apnsSender.js');

const message = {
  token: 'abc123',
  environment: 'production' as const,
  priority: 'high' as const,
  collapseId: 'c0ffee',
  sealed: 'U0VBTEVE',
  expiresAt: 1_900_000_000,
};

beforeEach(() => {
  requests.length = 0;
  reply = { status: 200, body: '' };
});

describe('sendApns', () => {
  it('sends an alert push whose visible text is the constant fallback', async () => {
    await expect(sendApns(message)).resolves.toEqual({ ok: true });
    const [req] = requests;
    expect(req.headers).toMatchObject({
      ':method': 'POST',
      ':path': '/3/device/abc123',
      'apns-push-type': 'alert',
      'apns-topic': 'de.gruenerator.app',
      'apns-priority': '10',
      'apns-expiration': '1900000000',
      'apns-collapse-id': 'c0ffee',
    });
    expect(req.headers.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(JSON.parse(req.body)).toEqual({
      aps: {
        alert: APNS_FALLBACK_ALERT,
        'mutable-content': 1,
        sound: 'default',
        'thread-id': 'c0ffee',
      },
      gp: 'U0VBTEVE',
    });
  });

  it('maps normal priority to 5 and omits collapse headers without a thread', async () => {
    await sendApns({ ...message, priority: 'normal', collapseId: null });
    const [req] = requests;
    expect(req.headers['apns-priority']).toBe('5');
    expect(req.headers).not.toHaveProperty('apns-collapse-id');
    expect(JSON.parse(req.body).aps).not.toHaveProperty('thread-id');
  });

  it('opens one connection per environment and reuses it', async () => {
    await sendApns(message);
    await sendApns({ ...message, environment: 'sandbox' });
    const opened = connect.mock.calls.length;
    await sendApns(message);
    await sendApns({ ...message, environment: 'sandbox' });
    expect(connect.mock.calls.length).toBe(opened);
    expect(connect.mock.calls.map(([h]) => h)).toContain('https://api.sandbox.push.apple.com');
  });

  it.each([
    [410, 'Unregistered', true],
    [400, 'BadDeviceToken', true],
    [400, 'PayloadTooLarge', false],
    [403, 'ExpiredProviderToken', false],
    [429, 'TooManyRequests', false],
  ])('status %i %s → unregistered=%s', async (status, reason, unregistered) => {
    reply = { status, body: JSON.stringify({ reason }) };
    await expect(sendApns(message)).resolves.toEqual({ ok: false, status, reason, unregistered });
  });
});
