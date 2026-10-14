import {
  getSlidesArray,
  seedSlideBody,
  slideToYMap,
} from '@gruenerator/contracts/presentations-ops';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import type { Slide } from '@gruenerator/contracts';

const hocuspocusInternal = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<unknown>>());
vi.mock('../collab/hocuspocusInternal.js', () => ({ hocuspocusInternal }));

const { applyPresentationOpsLive } = await import('./presentationOpsService.js');

const slide = (id: string, title: string): Slide => ({
  id,
  layout: 'content',
  title,
  body: `Inhalt ${title}`,
  notes: '',
  background: null,
  transition: null,
  fragments: false,
});

function serverDeck(): Y.Doc {
  const doc = new Y.Doc();
  doc.transact(() => {
    for (const s of [slide('a', 'Eins'), slide('b', 'Zwei')]) {
      getSlidesArray(doc).push([slideToYMap(s)]);
      seedSlideBody(doc, s);
    }
  });
  return doc;
}

const titles = (doc: Y.Doc) =>
  getSlidesArray(doc)
    .toArray()
    .map((m) => m.get('title'));

let server: Y.Doc;
beforeEach(() => {
  server = serverDeck();
  hocuspocusInternal.mockReset();
  hocuspocusInternal.mockImplementation(async (method, _path, body) => {
    if (method === 'GET') {
      return { update: Buffer.from(Y.encodeStateAsUpdate(server)).toString('base64') };
    }
    const { update } = body as { update: string };
    Y.applyUpdate(server, new Uint8Array(Buffer.from(update, 'base64')));
    return { ok: true, live: true };
  });
});

describe('applyPresentationOpsLive', () => {
  it('sends only the diff, and it lands on the live deck', async () => {
    const out = await applyPresentationOpsLive('d1', [
      { type: 'update_slide', slide: 1, title: 'Neu' } as never,
    ]);
    expect(out).toEqual({ applied: 1, skipped: [], live: true });
    expect(hocuspocusInternal).toHaveBeenLastCalledWith(
      'POST',
      '/internal/doc/d1/yjs',
      expect.objectContaining({ kind: 'presentations' })
    );
    expect(titles(server)).toEqual(['Neu', 'Zwei']);
  });

  it('writes nothing when every op is skipped', async () => {
    const out = await applyPresentationOpsLive('d1', [
      { type: 'update_slide', slide: 9, title: 'X' } as never,
    ]);
    expect(out.applied).toBe(0);
    expect(out.skipped.length).toBeGreaterThan(0);
    expect(hocuspocusInternal).toHaveBeenCalledTimes(1);
  });

  it('fails loudly when the deck cannot be read', async () => {
    hocuspocusInternal.mockRejectedValueOnce(new Error('down'));
    await expect(applyPresentationOpsLive('d1', [])).rejects.toThrow('down');
  });
});
