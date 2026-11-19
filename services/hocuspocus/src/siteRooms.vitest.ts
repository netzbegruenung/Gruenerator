import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  SITE_DOC_MAX_BYTES,
  SITE_NOT_SEEDED,
  SITE_TOO_LARGE,
  applySiteSeed,
  persistenceKey,
  siteIdFromRoom,
  siteRoomGate,
  siteRoomOf,
} from './siteRooms.js';

const SITE_ID = '3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f';

function updateWith(text: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getMap('siteMeta').set('title', text);
  return Y.encodeStateAsUpdate(doc);
}

describe('siteIdFromRoom', () => {
  it('returns the uuid of a site room', () => {
    expect(siteIdFromRoom(`site-${SITE_ID}`)).toBe(SITE_ID);
  });

  it('returns null for a site room without a uuid', () => {
    expect(siteIdFromRoom('site-x')).toBeNull();
  });

  it('returns null for an upper-case uuid, so one site cannot get two live docs', () => {
    expect(siteIdFromRoom(`site-${SITE_ID.toUpperCase()}`)).toBeNull();
  });

  it('returns null for a bare uuid', () => {
    expect(siteIdFromRoom(SITE_ID)).toBeNull();
  });
});

describe('persistenceKey', () => {
  it('maps a site room to the bare uuid', () => {
    expect(persistenceKey(`site-${SITE_ID}`)).toBe(SITE_ID);
  });

  it('leaves every other room unchanged', () => {
    expect(persistenceKey(SITE_ID)).toBe(SITE_ID);
    expect(persistenceKey('site-x')).toBe('site-x');
  });
});

describe('applySiteSeed', () => {
  it('seeds an empty doc', () => {
    const doc = new Y.Doc();
    expect(applySiteSeed(doc, updateWith('Erste'))).toBe(true);
    expect(doc.getMap('siteMeta').get('title')).toBe('Erste');
  });

  it('returns false on a doc that already has state and leaves it alone', () => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, updateWith('Erste'));
    expect(applySiteSeed(doc, updateWith('Zweite'))).toBe(false);
    expect(doc.getMap('siteMeta').get('title')).toBe('Erste');
  });
});

describe('siteRoomOf', () => {
  it('lower-cases the id', () => {
    expect(siteRoomOf(SITE_ID.toUpperCase())).toBe(`site-${SITE_ID}`);
  });

  it('rejects a non-uuid', () => {
    expect(siteRoomOf('x')).toBeNull();
    expect(siteRoomOf(`${SITE_ID}/x`)).toBeNull();
  });
});

describe('siteRoomGate', () => {
  const stored = (has: boolean) => async () => has;

  it('refuses a room with neither a live doc nor stored rows', async () => {
    expect(await siteRoomGate(null, stored(false))).toBe(SITE_NOT_SEEDED);
  });

  it('admits a room with stored rows', async () => {
    expect(await siteRoomGate(null, stored(true))).toBeNull();
  });

  it('refuses a live doc that is still empty, whatever is stored', async () => {
    expect(await siteRoomGate(new Y.Doc(), stored(true))).toBe(SITE_NOT_SEEDED);
  });

  it('admits a live seeded doc', async () => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, updateWith('Erste'));
    expect(await siteRoomGate(doc, stored(false))).toBeNull();
  });

  it('refuses a live doc over the store cap', async () => {
    const doc = new Y.Doc();
    doc.getMap('siteMeta').set('blob', 'x'.repeat(SITE_DOC_MAX_BYTES));
    expect(await siteRoomGate(doc, stored(true))).toBe(SITE_TOO_LARGE);
  });
});
