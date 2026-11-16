import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const store = new Map<string, { value: string; expiresAt: number }>();
  const state = { now: 0, ready: true, throwing: false };
  const live = (key: string) => {
    const e = store.get(key);
    if (e && e.expiresAt <= state.now) store.delete(key);
    return store.get(key);
  };
  const client = {
    get isReady() {
      return state.ready;
    },
    eval: (script: string, o: { keys: string[]; arguments: string[] }) => {
      if (state.throwing) return Promise.reject(new Error('down'));
      const key = o.keys[0];
      const e = live(key);
      if (script.includes("redis.call('del'")) {
        if (e && e.value === o.arguments[0]) {
          store.delete(key);
          return Promise.resolve(1);
        }
        return Promise.resolve(0);
      }
      // acquire: [holder, userId, ttl]
      const [holder, userId, ttl] = o.arguments;
      if (!e || e.value.startsWith(userId + ':')) {
        store.set(key, { value: holder, expiresAt: state.now + Number(ttl) });
        return Promise.resolve(1);
      }
      return Promise.resolve(0);
    },
  };
  return { store, state, client };
});

vi.mock('../../utils/redis/client.js', () => ({ default: fake.client }));

const { acquireThreadRun } = await import('./threadRunLock.js');

beforeEach(() => {
  fake.store.clear();
  fake.state.now = 0;
  fake.state.ready = true;
  fake.state.throwing = false;
});

describe('acquireThreadRun', () => {
  it('refuses a second acquire on the same thread', async () => {
    expect(await acquireThreadRun('t1', 'u-a', 'a')).not.toBeNull();
    expect(await acquireThreadRun('t1', 'u-b', 'b')).toBeNull();
    expect(await acquireThreadRun('t2', 'u-b', 'b')).not.toBeNull();
  });

  it('frees the thread on release', async () => {
    const lease = await acquireThreadRun('t1', 'u-a', 'a');
    await lease?.release();
    expect(await acquireThreadRun('t1', 'u-b', 'b')).not.toBeNull();
  });

  it('does not free a lock another holder took over', async () => {
    const first = await acquireThreadRun('t1', 'u-a', 'a');
    fake.state.now = 420_000; // lease expired
    const second = await acquireThreadRun('t1', 'u-b', 'b');
    expect(second).not.toBeNull();
    await first?.release(); // stale holder
    expect(await acquireThreadRun('t1', 'u-c', 'c')).toBeNull();
  });

  it('lets the same user take over her own stale lease; the old holder cannot free the new one', async () => {
    const stale = await acquireThreadRun('t1', 'u-a', 'run-1');
    const retake = await acquireThreadRun('t1', 'u-a', 'run-2');
    expect(retake).not.toBeNull();
    await stale?.release(); // old holder after takeover must not free the new lease
    expect(await acquireThreadRun('t1', 'u-b', 'b')).toBeNull();
    await retake?.release();
    expect(await acquireThreadRun('t1', 'u-b', 'b')).not.toBeNull();
  });

  it('still refuses a peer while another user holds the lease', async () => {
    await acquireThreadRun('t1', 'u-a', 'run-1');
    expect(await acquireThreadRun('t1', 'u-b', 'run-2')).toBeNull();
  });

  it('expires after 420 000 ms', async () => {
    await acquireThreadRun('t1', 'u-a', 'a');
    fake.state.now = 419_999;
    expect(await acquireThreadRun('t1', 'u-b', 'b')).toBeNull();
    fake.state.now = 420_000;
    expect(await acquireThreadRun('t1', 'u-b', 'b')).not.toBeNull();
  });

  it('fails open when Redis throws', async () => {
    fake.state.throwing = true;
    const lease = await acquireThreadRun('t1', 'u-a', 'a');
    expect(lease).not.toBeNull();
    await expect(lease?.release()).resolves.toBeUndefined();
  });

  it('fails open when Redis is not ready', async () => {
    fake.state.ready = false;
    expect(await acquireThreadRun('t1', 'u-a', 'a')).not.toBeNull();
    expect(await acquireThreadRun('t1', 'u-b', 'b')).not.toBeNull();
  });
});
