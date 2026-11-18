/**
 * Fan-out: Drossel je Faden, Plattformwahl samt Priorität, was Apple zu sehen
 * bekommt, und welche Geräte nach einer Absage verschwinden.
 */
import { createDecipheriv, randomBytes } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Device {
  id: string;
  user_id: string;
  platform: 'ios' | 'android';
  token: string;
  key: Buffer;
  apns_environment: 'production' | 'sandbox' | null;
}

let devices: Device[] = [];
const where = vi.fn(async () => devices);
const db = { select: vi.fn(() => ({ from: () => ({ leftJoin: () => ({ where }) }) })) };
vi.mock('../../database/services/DrizzleService.js', () => ({ getDrizzleInstance: () => db }));

const claimed = new Set<string>();
const redisSet = vi.fn(async (key: string) => {
  if (claimed.has(key)) return null;
  claimed.add(key);
  return 'OK';
});
vi.mock('../../utils/redis/client.js', () => ({
  ensureConnected: async () => {},
  redisClient: { set: redisSet },
}));

const flags = { apns: true, fcm: true };
const sendApns = vi.fn(async (_m: unknown) => ({ ok: true as const }));
const sendFcm = vi.fn(async (_m: unknown) => ({ ok: true as const }));
vi.mock('./apnsSender.js', () => ({ apnsConfigured: () => flags.apns, sendApns }));
vi.mock('./fcmSender.js', () => ({ fcmConfigured: () => flags.fcm, sendFcm }));
const removePushDevices = vi.fn(async (_ids: string[]) => {});
vi.mock('./pushDevices.js', () => ({ removePushDevices }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { deliverPush } = await import('./pushDelivery.js');

const iphone: Device = {
  id: 'd-ios',
  user_id: 'u1',
  platform: 'ios',
  token: 'apns-token',
  key: randomBytes(32),
  apns_environment: 'sandbox',
};
const pixel: Device = {
  id: 'd-android',
  user_id: 'u1',
  platform: 'android',
  token: 'fcm-token',
  key: randomBytes(32),
  apns_environment: null,
};

const mention = {
  id: 'n-mention',
  user_id: 'u1',
  type: 'group_user_mentioned',
  title: 'Anna hat Dich erwähnt',
  body: 'Schau mal',
  action_url: '/projekte/p1',
  group_key: null,
};
const post = { ...mention, id: 'n-post', type: 'group_post_created', group_key: 'group:g1' };

function open(key: Buffer, sealed: string): Record<string, unknown> {
  const raw = Buffer.from(sealed, 'base64');
  const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(raw.length - 16));
  return JSON.parse(
    Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString()
  ) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  claimed.clear();
  devices = [iphone, pixel];
  flags.apns = true;
  flags.fcm = true;
});

describe('deliverPush', () => {
  it('sends a personal notification to every device of the user, high priority', async () => {
    await deliverPush([mention]);
    expect(sendApns).toHaveBeenCalledTimes(1);
    expect(sendFcm).toHaveBeenCalledTimes(1);
    const apns = sendApns.mock.calls[0][0] as {
      priority: string;
      environment: string;
      collapseId: null;
      sealed: string;
    };
    expect(apns).toMatchObject({
      token: 'apns-token',
      environment: 'sandbox',
      priority: 'high',
      collapseId: null,
    });
    expect(open(iphone.key, apns.sealed)).toMatchObject({
      v: 1,
      id: 'n-mention',
      title: 'Anna hat Dich erwähnt',
      url: '/projekte/p1',
    });
    const fcm = sendFcm.mock.calls[0][0] as {
      priority: string;
      ttlSeconds: number;
      sealed: string;
    };
    expect(fcm).toMatchObject({ token: 'fcm-token', priority: 'high', ttlSeconds: 86400 });
    expect(open(pixel.key, fcm.sealed)).toMatchObject({ id: 'n-mention' });
  });

  it('sends project activity at normal priority, collapsed per device', async () => {
    await deliverPush([post]);
    const apns = sendApns.mock.calls[0][0] as {
      priority: string;
      collapseId: string;
      sealed: string;
    };
    expect(apns.priority).toBe('normal');
    expect(apns.collapseId).toMatch(/^[0-9a-f]{32}$/);
    const fcm = sendFcm.mock.calls[0][0] as { sealed: string };
    const androidCollapse = open(pixel.key, fcm.sealed).collapse;
    expect(androidCollapse).toMatch(/^[0-9a-f]{32}$/);
    expect(androidCollapse).not.toBe(apns.collapseId);
  });

  it('throttles a thread to one push per window, never a personal notification', async () => {
    await deliverPush([post, { ...post, id: 'n-post-2' }]);
    await deliverPush([mention]);
    await deliverPush([{ ...mention, id: 'n-mention-2' }]);
    expect(sendApns).toHaveBeenCalledTimes(3);
  });

  it('ignores types that never push, without touching the database', async () => {
    await deliverPush([{ ...mention, type: 'notebook_liked' }]);
    expect(db.select).not.toHaveBeenCalled();
    expect(sendApns).not.toHaveBeenCalled();
  });

  it('skips a platform without credentials', async () => {
    flags.fcm = false;
    await deliverPush([mention]);
    expect(sendApns).toHaveBeenCalledTimes(1);
    expect(sendFcm).not.toHaveBeenCalled();
  });

  it('removes devices that Apple or Google report as gone', async () => {
    sendFcm.mockResolvedValueOnce({
      ok: false,
      status: 404,
      reason: 'UNREGISTERED',
      unregistered: true,
    } as never);
    await deliverPush([mention]);
    expect(removePushDevices).toHaveBeenCalledWith(['d-android']);
  });
});
