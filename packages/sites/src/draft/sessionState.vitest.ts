import { type SyncGate } from '@gruenerator/collab';
import { describe, expect, it } from 'vitest';

import { saveStatus, sessionState } from './useSiteDraftSession';

describe('sessionState', () => {
  const prepares = ['pending', 'error', 'done'] as const;
  const gates: SyncGate[] = ['waiting', 'ready', 'unavailable'];

  it('maps prepare x gate x seeded', () => {
    const expected: Record<string, string> = {};
    for (const gate of gates) {
      for (const seeded of [true, false]) {
        expected[`pending/${gate}/${seeded}`] = 'preparing';
        expected[`error/${gate}/${seeded}`] = 'error';
      }
    }
    for (const seeded of [true, false]) {
      expected[`done/waiting/${seeded}`] = 'connecting';
      expected[`done/unavailable/${seeded}`] = 'unavailable';
    }
    expected['done/ready/true'] = 'ready';
    expected['done/ready/false'] = 'error';

    for (const prepare of prepares) {
      for (const gate of gates) {
        for (const seeded of [true, false]) {
          expect(sessionState({ prepare, gate, seeded }), `${prepare}/${gate}/${seeded}`).toBe(
            expected[`${prepare}/${gate}/${seeded}`]
          );
        }
      }
    }
  });

  it('a draft over the size cap wins over every other state', () => {
    expect(sessionState({ prepare: 'done', gate: 'ready', seeded: true, tooLarge: true })).toBe(
      'tooLarge'
    );
  });
});

describe('saveStatus', () => {
  it('is offline when disconnected', () => {
    expect(saveStatus({ isConnected: false, unsyncedChanges: 3 })).toBe('offline');
  });
  it('is saving while changes are unsynced', () => {
    expect(saveStatus({ isConnected: true, unsyncedChanges: 1 })).toBe('saving');
  });
  it('is saved otherwise', () => {
    expect(saveStatus({ isConnected: true, unsyncedChanges: 0 })).toBe('saved');
  });
});
