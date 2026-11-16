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
    set: (key: string, value: string, opts: { NX?: boolean; PX?: number }) => {
      if (state.throwing) return Promise.reject(new Error('down'));
      if (opts.NX && live(key)) return Promise.resolve(null);
      store.set(key, { value, expiresAt: state.now + (opts.PX ?? Infinity) });
      return Promise.resolve('OK');
    },
    eval: (_script: string, o: { keys: string[]; arguments: string[] }) => {
      if (state.throwing) return Promise.reject(new Error('down'));
      const e = live(o.keys[0]);
      if (e && e.value === o.arguments[0]) {
        store.delete(o.keys[0]);
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
    expect(await acquireThreadRun('t1', 'a')).not.toBeNull();
    expect(await acquireThreadRun('t1', 'b')).toBeNull();
    expect(await acquireThreadRun('t2', 'b')).not.toBeNull();
  });

  it('frees the thread on release', async () => {
    const lease = await acquireThreadRun('t1', 'a');
    await lease?.release();
    expect(await acquireThreadRun('t1', 'b')).not.toBeNull();
  });

  it('does not free a lock another holder took over', async () => {
    const first = await acquireThreadRun('t1', 'a');
    fake.state.now = 420_000; // lease expired
    const second = await acquireThreadRun('t1', 'b');
    expect(second).not.toBeNull();
    await first?.release(); // stale holder
    expect(await acquireThreadRun('t1', 'c')).toBeNull();
  });

  it('expires after 420 000 ms', async () => {
    await acquireThreadRun('t1', 'a');
    fake.state.now = 419_999;
    expect(await acquireThreadRun('t1', 'b')).toBeNull();
    fake.state.now = 420_000;
    expect(await acquireThreadRun('t1', 'b')).not.toBeNull();
  });

  it('fails open when Redis throws', async () => {
    fake.state.throwing = true;
    const lease = await acquireThreadRun('t1', 'a');
    expect(lease).not.toBeNull();
    await expect(lease?.release()).resolves.toBeUndefined();
  });

  it('fails open when Redis is not ready', async () => {
    fake.state.ready = false;
    expect(await acquireThreadRun('t1', 'a')).not.toBeNull();
    expect(await acquireThreadRun('t1', 'b')).not.toBeNull();
  });
});
