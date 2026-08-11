import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerServiceWorker } from './registerServiceWorker';

/**
 * Regression: the asset-cache service worker must never reload the page or
 * open a confirm() dialog. The old controllerchange → window.location.reload()
 * handler fired on the FIRST install too (clients.claim() changes the
 * controller), silently reloading the startpage a few seconds after load.
 */

type Listener = (...args: unknown[]) => void;

class FakeEventTarget {
  listeners = new Map<string, Listener[]>();
  addEventListener(type: string, cb: Listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(cb);
    this.listeners.set(type, list);
  }
  emit(type: string, ...args: unknown[]) {
    for (const cb of this.listeners.get(type) ?? []) cb(...args);
  }
}

const setupFakeServiceWorker = () => {
  const newWorker = Object.assign(new FakeEventTarget(), {
    state: 'installing',
    postMessage: vi.fn(),
  });
  const registration = Object.assign(new FakeEventTarget(), {
    installing: newWorker as unknown as ServiceWorker,
  });
  const container = Object.assign(new FakeEventTarget(), {
    register: vi.fn().mockResolvedValue(registration),
    controller: {} as ServiceWorker,
  });
  vi.stubGlobal('navigator', { ...window.navigator, serviceWorker: container });
  return { container, registration, newWorker };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('registerServiceWorker', () => {
  it('activates an updated worker silently — no confirm dialog', async () => {
    const { registration, newWorker } = setupFakeServiceWorker();
    const confirmSpy = vi.spyOn(window, 'confirm');
    // registerServiceWorker only registers in production builds.
    vi.stubEnv('DEV', false);

    await registerServiceWorker();

    registration.emit('updatefound');
    newWorker.state = 'installed';
    newWorker.emit('statechange');

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(newWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('never attaches a controllerchange handler (no self-reload on first install)', async () => {
    const { container } = setupFakeServiceWorker();
    vi.stubEnv('DEV', false);

    await registerServiceWorker();

    expect(container.listeners.has('controllerchange')).toBe(false);
    // Defense in depth: even if a controllerchange fires, nothing must run.
    container.emit('controllerchange');
  });

  it('does not skip-waiting on first install (no controller yet)', async () => {
    const { container, registration, newWorker } = setupFakeServiceWorker();
    container.controller = null as unknown as ServiceWorker;
    vi.stubEnv('DEV', false);

    await registerServiceWorker();

    registration.emit('updatefound');
    newWorker.state = 'installed';
    newWorker.emit('statechange');

    expect(newWorker.postMessage).not.toHaveBeenCalled();
  });
});
