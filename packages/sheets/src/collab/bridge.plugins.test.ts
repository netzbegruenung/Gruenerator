import { CommandType } from '@univerjs/presets';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { SHEET_META_KEYS, SHEET_YDOC_KEYS, type SheetMutationEntry } from '../lib/ydocSchema.js';
import { attachYjsBridge } from './bridge.js';

import type { FUniver, IWorkbookData } from '@univerjs/presets';

const DOC_ID = 'doc-plugins';

/**
 * Fake FUniver that (a) echoes created workbook data back through `save()` so
 * seeded plugin `resources` land in the snapshot, (b) captures the
 * command-executed callback so a test can fire plugin mutations, and (c)
 * records `executeCommand` calls so we can assert remote replay.
 */
function makeApi() {
  const created: Partial<IWorkbookData>[] = [];
  const executed: { id: string; params: unknown; options: unknown }[] = [];
  let cmdCb:
    | ((info: { type: number; id: string; params?: unknown }, opts?: unknown) => void)
    | null = null;

  const api = {
    createWorkbook: (data: Partial<IWorkbookData>) => {
      created.push(data);
      return { save: () => data, setEditable: () => {} };
    },
    onCommandExecuted: (cb: typeof cmdCb) => {
      cmdCb = cb;
      return { dispose() {} };
    },
    executeCommand: (id: string, params?: unknown, options?: unknown) => {
      executed.push({ id, params, options });
    },
  };

  return {
    api: api as unknown as FUniver,
    created,
    executed,
    fire: (info: { type: number; id: string; params?: unknown }, opts?: unknown) =>
      cmdCb?.(info, opts),
  };
}

const sync = (a: Y.Doc, b: Y.Doc) => {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
};

// A filter's per-unit state lands in `IWorkbookData.resources`, the same shape
// every free plugin (conditional-format, data-validation, comment, note) uses.
const pluginResources = [
  { name: 'SHEET_FILTER_PLUGIN', data: JSON.stringify({ s1: { ref: { startRow: 0 } } }) },
];

describe('collab bridge — free-plugin persistence & sync', () => {
  it('persists plugin resources through seed → snapshot → reload', () => {
    const ydoc = new Y.Doc();
    const seed: Partial<IWorkbookData> = {
      name: 'Mit Filter',
      sheetOrder: ['s1'],
      sheets: { s1: { id: 's1', name: 'Mit Filter', cellData: {} } } as IWorkbookData['sheets'],
      resources: pluginResources,
    };

    const a = makeApi();
    const bridgeA = attachYjsBridge({
      univerAPI: a.api,
      ydoc,
      documentId: DOC_ID,
      canWrite: true,
      seedWorkbook: seed,
    });

    // The seed snapshot written to the shared doc carries the plugin resources.
    const yMeta = ydoc.getMap<unknown>(SHEET_YDOC_KEYS.meta);
    const snap = JSON.parse(yMeta.get(SHEET_META_KEYS.snapshot) as string) as IWorkbookData;
    expect(snap.resources).toEqual(pluginResources);
    bridgeA.dispose();

    // A fresh client opening the same doc reloads with the resources intact.
    const b = makeApi();
    const bridgeB = attachYjsBridge({
      univerAPI: b.api,
      ydoc,
      documentId: DOC_ID,
      canWrite: true,
    });
    expect(b.created[0]?.id).toBe(DOC_ID);
    expect(b.created[0]?.resources).toEqual(pluginResources);
    bridgeB.dispose();
  });

  it('forwards a plugin MUTATION and a peer replays it via the collab path', async () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const a = makeApi();
    const bridgeA = attachYjsBridge({
      univerAPI: a.api,
      ydoc: docA,
      documentId: DOC_ID,
      canWrite: true,
    });

    const filterMutation = {
      type: CommandType.MUTATION,
      id: 'sheet.mutation.set-sheets-filter-criteria',
      params: { unitId: DOC_ID, subUnitId: 's1', col: 0, criteria: { colId: 0 } },
    };
    a.fire(filterMutation, undefined);
    // Let the microtask-scheduled flush run.
    await new Promise((r) => setTimeout(r, 0));

    const logA = docA.getArray<SheetMutationEntry>(SHEET_YDOC_KEYS.mutations).toArray();
    expect(logA.some((e) => e.id === filterMutation.id)).toBe(true);

    // Peer joins (read-only) and replays the forwarded mutation on sync.
    const b = makeApi();
    const bridgeB = attachYjsBridge({
      univerAPI: b.api,
      ydoc: docB,
      documentId: DOC_ID,
      canWrite: false,
    });
    sync(docA, docB);

    const replay = b.executed.find((c) => c.id === filterMutation.id);
    expect(replay).toBeDefined();
    expect((replay?.options as { fromCollab?: boolean })?.fromCollab).toBe(true);

    bridgeA.dispose();
    bridgeB.dispose();
  });
});
