import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { hasLocalState, syncGateState } from './useSyncGate';

const base = {
  hasProvider: true,
  isSynced: false,
  syncTimedOut: true,
  isLocalLoaded: true,
  hasLocalState: false,
};

describe('syncGateState', () => {
  it('waits for the provider, the timeout and the local cache', () => {
    expect(syncGateState({ ...base, hasProvider: false, isSynced: true })).toBe('waiting');
    expect(syncGateState({ ...base, syncTimedOut: false })).toBe('waiting');
    expect(syncGateState({ ...base, isLocalLoaded: false })).toBe('waiting');
  });

  it('is ready once synced, with or without a local copy', () => {
    expect(syncGateState({ ...base, isSynced: true, syncTimedOut: false })).toBe('ready');
  });

  it('falls back to a cached copy after the timeout', () => {
    expect(syncGateState({ ...base, hasLocalState: true })).toBe('ready');
  });

  it('is unavailable after the timeout without a local copy', () => {
    expect(syncGateState(base)).toBe('unavailable');
  });
});

describe('hasLocalState', () => {
  it('is false for a fresh doc, even after reading shared types', () => {
    const doc = new Y.Doc();
    doc.getMap('threads');
    doc.getXmlFragment('document-store');
    expect(hasLocalState(doc)).toBe(false);
    expect(hasLocalState(null)).toBe(false);
  });

  it('is true once an update arrived, e.g. from IndexedDB', () => {
    const source = new Y.Doc();
    source.getArray('rows').push(['a']);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(source));
    expect(hasLocalState(doc)).toBe(true);
  });
});
