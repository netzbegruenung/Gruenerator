import { describe, it, expect } from 'vitest';

import {
  buildMessageMenuActions,
  buildThreadMenuActions,
  asMessageMenuId,
  asThreadMenuId,
} from './menuActions';

const ids = (actions: { id?: string }[]) => actions.map((a) => a.id);

describe('buildThreadMenuActions', () => {
  it('offers rename, share, archive and delete on a live conversation', () => {
    expect(ids(buildThreadMenuActions(false))).toEqual(['rename', 'share', 'archive', 'delete']);
  });

  it('swaps archive for restore on an archived one', () => {
    expect(ids(buildThreadMenuActions(true))).toEqual(['rename', 'share', 'unarchive', 'delete']);
  });

  it('never offers both archive and restore', () => {
    for (const archived of [true, false]) {
      const present = ids(buildThreadMenuActions(archived));
      expect(present.filter((id) => id === 'archive' || id === 'unarchive')).toHaveLength(1);
    }
  });

  it('marks only the delete entry destructive, and keeps it last', () => {
    const actions = buildThreadMenuActions(false);
    const destructive = actions.filter((a) => a.attributes?.destructive);
    expect(ids(destructive)).toEqual(['delete']);
    expect(actions[actions.length - 1].id).toBe('delete');
  });

  it('labels every entry — an id-only entry renders as an empty row', () => {
    for (const archived of [true, false]) {
      for (const action of buildThreadMenuActions(archived)) {
        expect(action.title.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('buildMessageMenuActions', () => {
  it('offers the Word export and the editor handoff', () => {
    expect(ids(buildMessageMenuActions(false))).toEqual(['export-docx', 'open-in-docs']);
  });

  it('enables both while nothing is exporting', () => {
    expect(buildMessageMenuActions(false).every((a) => !a.attributes?.disabled)).toBe(true);
  });

  it('disables both during an export, not just the one that started it', () => {
    // Either handoff would land on top of the running one.
    expect(buildMessageMenuActions(true).every((a) => a.attributes?.disabled)).toBe(true);
  });
});

describe('id narrowing', () => {
  it('accepts every id the thread builder emits', () => {
    for (const archived of [true, false]) {
      for (const action of buildThreadMenuActions(archived)) {
        expect(asThreadMenuId(action.id ?? '')).toBe(action.id);
      }
    }
  });

  it('accepts every id the message builder emits', () => {
    for (const action of buildMessageMenuActions(false)) {
      expect(asMessageMenuId(action.id ?? '')).toBe(action.id);
    }
  });

  it('rejects anything else instead of falling through to a branch', () => {
    // The native side hands back a bare string; a typo upstream must not
    // resolve to a neighbouring action.
    for (const junk of ['', 'Löschen', 'delete ', 'DELETE', 'pin']) {
      expect(asThreadMenuId(junk)).toBeNull();
      expect(asMessageMenuId(junk)).toBeNull();
    }
  });
});
