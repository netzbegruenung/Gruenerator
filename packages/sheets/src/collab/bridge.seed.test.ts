import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { SHEET_META_KEYS, SHEET_YDOC_KEYS } from '../lib/ydocSchema.js';
import { attachYjsBridge } from './bridge.js';

import type { FUniver, IWorkbookData } from '@univerjs/presets';

const DOC_ID = 'doc-123';

// Minimal template workbook (the shape apps/web sheetTemplates emit).
const template: Partial<IWorkbookData> = {
  name: 'Mitglieder',
  sheetOrder: ['s1'],
  sheets: {
    s1: { id: 's1', name: 'Mitglieder', cellData: { 0: { 0: { v: 'Name' } } } },
  } as IWorkbookData['sheets'],
};

/** Fake FUniver capturing the workbook data handed to createWorkbook. */
function makeApi() {
  const calls: { createArg: Partial<IWorkbookData> | null } = { createArg: null };
  const workbook = { save: () => calls.createArg ?? {} };
  const api = {
    createWorkbook: (data: Partial<IWorkbookData>) => {
      calls.createArg = data;
      return workbook;
    },
    onCommandExecuted: () => ({ dispose() {} }),
    executeCommand: () => {},
  };
  return { api: api as unknown as FUniver, calls };
}

describe('attachYjsBridge — template seeding', () => {
  it('seeds the provided template workbook (id forced) on a fresh doc', () => {
    const ydoc = new Y.Doc();
    const { api, calls } = makeApi();

    const bridge = attachYjsBridge({
      univerAPI: api,
      ydoc,
      documentId: DOC_ID,
      canWrite: true,
      seedWorkbook: template,
    });

    // Template data reaches Univer, with unitId forced to the doc id.
    expect(calls.createArg?.id).toBe(DOC_ID);
    expect(calls.createArg?.sheets?.['s1']?.cellData?.[0]?.[0]?.v).toBe('Name');

    // The guard is armed so later opens don't re-seed.
    const yMeta = ydoc.getMap(SHEET_YDOC_KEYS.meta);
    expect(yMeta.get(SHEET_META_KEYS.seeded)).toBe(true);
    expect(typeof yMeta.get(SHEET_META_KEYS.snapshot)).toBe('string');

    bridge.dispose();
  });

  it('falls back to a blank workbook when no template is given', () => {
    const ydoc = new Y.Doc();
    const { api, calls } = makeApi();

    const bridge = attachYjsBridge({
      univerAPI: api,
      ydoc,
      documentId: DOC_ID,
      canWrite: true,
    });

    expect(calls.createArg?.id).toBe(DOC_ID);
    // Blank fallback carries exactly one worksheet (Univer renders no grid for
    // an empty `sheets: {}`), and none of the template's cells.
    expect(Object.keys(calls.createArg?.sheets ?? {}).length).toBe(1);
    expect(calls.createArg?.sheets?.['s1']).toBeUndefined();

    bridge.dispose();
  });

  it('does not seed a read-only client (no yMeta write)', () => {
    const ydoc = new Y.Doc();
    const { api } = makeApi();

    const bridge = attachYjsBridge({
      univerAPI: api,
      ydoc,
      documentId: DOC_ID,
      canWrite: false,
      seedWorkbook: template,
    });

    const yMeta = ydoc.getMap(SHEET_YDOC_KEYS.meta);
    expect(yMeta.get(SHEET_META_KEYS.seeded)).toBeUndefined();

    bridge.dispose();
  });

  it('ignores the template when the doc already has a snapshot', () => {
    const ydoc = new Y.Doc();
    const yMeta = ydoc.getMap(SHEET_YDOC_KEYS.meta);
    yMeta.set(
      SHEET_META_KEYS.snapshot,
      JSON.stringify({
        id: 'stale',
        sheetOrder: ['s9'],
        sheets: { s9: { id: 's9', name: 'Alt', cellData: {} } },
      })
    );
    const { api, calls } = makeApi();

    const bridge = attachYjsBridge({
      univerAPI: api,
      ydoc,
      documentId: DOC_ID,
      canWrite: true,
      seedWorkbook: template,
    });

    // Existing snapshot wins; template sheet is never applied. Id still forced.
    expect(calls.createArg?.id).toBe(DOC_ID);
    expect(calls.createArg?.sheets?.['s9']).toBeDefined();
    expect(calls.createArg?.sheets?.['s1']).toBeUndefined();

    bridge.dispose();
  });
});
