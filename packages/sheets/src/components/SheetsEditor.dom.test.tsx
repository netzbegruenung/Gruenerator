// @vitest-environment jsdom
import { LifecycleService, LifecycleStages } from '@univerjs/core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as Y from 'yjs';

import { SheetsEditor } from './SheetsEditor.js';

import type { FUniver } from '@univerjs/presets';

// jsdom has no canvas; Univer's render engine only needs calls to not throw.
vi.hoisted(() => {
  const noop: object = new Proxy(function () {}, {
    get: (_target, key) => {
      if (key === 'measureText') return () => ({ width: 1 });
      if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (typeof key === 'symbol' || key === 'canvas' || String(key).endsWith('PixelRatio'))
        return undefined;
      return noop;
    },
    apply: () => noop,
    set: () => true,
  });
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    Path2D: class {},
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  HTMLCanvasElement.prototype.getContext = (() =>
    noop) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })) as unknown as typeof window.matchMedia;
});

let host: HTMLDivElement;
let root: Root;
let errors: unknown[];
const onError = (event: ErrorEvent) => {
  errors.push(event.error);
  event.preventDefault();
};

beforeEach(() => {
  errors = [];
  window.addEventListener('error', onError);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  window.removeEventListener('error', onError);
  host.remove();
});

// Mounting Univer is the slow part and runs in the test body: warm it takes
// well under a second, on a cold CI runner 5–7 s — past vitest's default.
const MOUNT_BUDGET_MS = 30_000;

const settle = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

async function mount(ydoc: Y.Doc): Promise<FUniver> {
  let api: FUniver | null = null;
  await act(async () => {
    root.render(
      <SheetsEditor documentId="doc-1" ydoc={ydoc} editable onReady={(a) => (api = a)} />
    );
  });
  if (!api) throw new Error('SheetsEditor did not report ready');
  return api;
}

test(
  'unmounting with the shortcut panel open does not throw from the disposed LocaleService',
  async () => {
    const api = await mount(new Y.Doc());
    // The panel's controller only exists from the Steady stage on.
    await settle(400);
    (
      api as unknown as { _injector: { get: (t: typeof LifecycleService) => LifecycleService } }
    )._injector.get(LifecycleService).stage = LifecycleStages.Steady;
    await act(async () => {
      await api.executeCommand('base-ui.operation.toggle-shortcut-panel');
    });

    await act(async () => root.unmount());
    await settle(0);

    expect(errors.map(String)).toEqual([]);
  },
  MOUNT_BUDGET_MS
);

test(
  're-running the effect on the same host keeps the new instance mounted',
  async () => {
    await mount(new Y.Doc());
    await mount(new Y.Doc());
    await settle(0);

    const mounts = host.querySelectorAll('.gruenerator-sheets-editor__mount');
    expect(mounts).toHaveLength(1);
    expect(mounts[0]!.childElementCount).toBeGreaterThan(0);
    await act(async () => root.unmount());
  },
  MOUNT_BUDGET_MS
);
