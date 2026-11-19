import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { applySiteSeed, persistenceKey, siteIdFromRoom } from './siteRooms.js';

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
