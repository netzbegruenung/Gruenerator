/**
 * #4276: a chat sharepic edit writes the dreizeilen patch server-side, where
 * there are no font metrics to bound the bar group. The patch carries
 * `balkenFitPending`; the canvas fits once its fonts are ready, clears the
 * marker and writes both back to the page.
 */
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { PAGE_PERSISTED_STATE_KEYS } from '../../collab/pageElementStateKeys';
import { readPages, seedPagesIfEmpty, updatePageStateById } from '../../collab/pagesDoc';
import { PAGES_STATE_ORIGIN } from '../../collab/useYjsPages';
import { createPageSyncedCallbacks } from '../../collab/wrapCallbacksWithPageSync';
import { loadCanvasConfig } from '../../configs/configLoader';
import { AutoSaveStoreProvider } from '../../stores/AutoSaveStoreProvider';
import { balkenExtent } from '../../utils/balkenBounds';
import { GenericCanvas } from '../GenericCanvas';

import type { BalkenInstance } from '../../primitives/BalkenGroup';

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

const PAGE_ID = 'seed-0';
const LONG_LINE = 'Mehr Radwege für ganz Musterstadt und das Umland';

const pageState = (doc: Y.Doc): Record<string, unknown> =>
  readPages(doc).find((p) => p.id === PAGE_ID)!.state;

const settle = () => new Promise((r) => setTimeout(r, 0));

async function mountDreizeilen(seed: Record<string, unknown>, opts: { collab: boolean }) {
  const config = await loadCanvasConfig('dreizeilen');
  const doc = new Y.Doc();
  seedPagesIfEmpty(doc, [{ id: PAGE_ID, configId: 'dreizeilen', state: seed }]);
  const page = readPages(doc)[0];
  const noop = () => {};
  const callbacks = opts.collab
    ? createPageSyncedCallbacks(
        () => ({ onLine1Change: noop, onLine2Change: noop, onLine3Change: noop }),
        (partial) =>
          doc.transact(() => updatePageStateById(doc, PAGE_ID, partial), PAGES_STATE_ORIGIN),
        PAGE_PERSISTED_STATE_KEYS
      )
    : {};
  const live: { state: Record<string, unknown> } = { state: {} };

  await act(async () => {
    render(
      <AutoSaveStoreProvider>
        <GenericCanvas
          config={config as never}
          initialProps={page.state}
          onExport={() => {}}
          onCancel={() => {}}
          callbacks={callbacks}
          autoSave={false}
          preview={!opts.collab}
          onLiveState={(state) => {
            live.state = state;
          }}
          {...(opts.collab ? { pageBinding: { pageYMap: page.yMap, isSynced: true } } : {})}
        />
      </AutoSaveStoreProvider>
    );
    await settle();
  });
  await act(settle);

  return { doc, live };
}

function primary(state: Record<string, unknown>): BalkenInstance {
  return (state.balkenInstances as BalkenInstance[]).find((b) => b.id === 'dreizeilen-balken')!;
}

function expectInside(state: Record<string, unknown>) {
  const e = balkenExtent(primary(state), 1080, 1350);
  expect(e.left).toBeGreaterThanOrEqual(0);
  expect(e.right).toBeLessThanOrEqual(1080);
  expect(e.top).toBeGreaterThanOrEqual(0);
  expect(e.bottom).toBeLessThanOrEqual(1350);
}

const OVERSIZED = {
  line1: LONG_LINE,
  line2: 'für alle',
  line3: 'jetzt',
  fontSize: 120,
  balkenScale: 2,
};

describe('dreizeilen bar fit after a chat edit', () => {
  it('fits a marked group on mount and writes the fit and the cleared marker back', async () => {
    const { doc, live } = await mountDreizeilen(
      { ...OVERSIZED, balkenFitPending: true },
      { collab: true }
    );

    expect(live.state.balkenFitPending).toBe(false);
    expectInside(live.state);
    expect(live.state.balkenScale).toBeLessThan(2);

    const persisted = pageState(doc);
    expect(persisted.balkenFitPending).toBe(false);
    expect(persisted.balkenScale).toBe(live.state.balkenScale);
    expect(persisted.balkenOffset).toEqual(live.state.balkenOffset);
  }, 90_000);

  it('leaves an unmarked group alone, even when it bleeds off the canvas', async () => {
    const { live } = await mountDreizeilen(OVERSIZED, { collab: true });
    expect(live.state.balkenScale).toBe(2);
    expect(live.state.balkenOffset).toEqual({ x: 0, y: 0 });
  }, 90_000);

  it('fits after a marked remote patch arrives on an open canvas', async () => {
    const { doc, live } = await mountDreizeilen(
      { line1: 'Kurz', line2: 'für alle', line3: 'jetzt', fontSize: 60, balkenScale: 1 },
      { collab: true }
    );
    expect(live.state.balkenScale).toBe(1);

    await act(async () => {
      doc.transact(() =>
        updatePageStateById(doc, PAGE_ID, {
          line1: LONG_LINE,
          fontSize: 120,
          balkenScale: 2,
          balkenFitPending: true,
        })
      );
      await settle();
    });
    await act(settle);

    expect(live.state.line1).toBe(LONG_LINE);
    expect(live.state.balkenFitPending).toBe(false);
    expectInside(live.state);
    expect(pageState(doc).balkenFitPending).toBe(false);
    expect(pageState(doc).balkenScale).toBe(live.state.balkenScale);
  }, 90_000);

  it('fits in a read-only preview without a page document', async () => {
    const { live } = await mountDreizeilen(
      { ...OVERSIZED, balkenFitPending: true },
      { collab: false }
    );
    expect(live.state.balkenFitPending).toBe(false);
    expectInside(live.state);
  }, 90_000);
});
