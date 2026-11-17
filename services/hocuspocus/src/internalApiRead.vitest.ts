import { CANVAS_DOCUMENT_VERSION } from '@ggraphic/schema';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { SAMPLE_STATE, bytesOf, clientDoc } from './canvasDoc.testUtils.js';
import { registerInternalApi } from './internalApi.js';

describe('GET /internal/canvas/:id/state', () => {
  let close: (() => Promise<void>) | null = null;

  afterEach(async () => {
    await close?.();
    close = null;
    vi.unstubAllEnvs();
  });

  /** `live` puts the document in Hocuspocus' map; otherwise it is served from persistence. */
  async function start(doc: Y.Doc | null, live: boolean): Promise<string> {
    vi.stubEnv('HOCUSPOCUS_INTERNAL_TOKEN', 'secret');
    const app = express();
    registerInternalApi(app, {
      server: {
        hocuspocus: { documents: new Map(doc && live ? [['doc-1', doc]] : []) },
      } as unknown as Parameters<typeof registerInternalApi>[1]['server'],
      persistence: {
        loadDocument: async () => (doc && !live ? bytesOf(doc) : null),
      } as unknown as Parameters<typeof registerInternalApi>[1]['persistence'],
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    close = () => new Promise<void>((resolve) => server.close(() => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    return `http://127.0.0.1:${address.port}/internal/canvas/doc-1/state`;
  }

  const get = (url: string) => fetch(url, { headers: { 'x-internal-token': 'secret' } });

  describe.each([
    ['live', true],
    ['stored', false],
  ])('%s document', (_name, live) => {
    it('answers 426 with the write code for a document stamped above this build', async () => {
      const doc = clientDoc({ stamp: CANVAS_DOCUMENT_VERSION + 1, structured: false });
      const res = await get(await start(doc, live));
      expect(res.status).toBe(426);
      expect(await res.json()).toMatchObject({
        code: 'CANVAS_DOCUMENT_NEWER',
        found: CANVAS_DOCUMENT_VERSION + 1,
        known: CANVAS_DOCUMENT_VERSION,
      });
    });

    it('answers 426 for a malformed stamp', async () => {
      const doc = clientDoc({ stamp: 3, structured: false });
      doc.getMap('meta').set('schemaVersion', 'vier');
      const res = await get(await start(doc, live));
      expect(res.status).toBe(426);
    });

    it.each([3, 4])('still reads a version %i document', async (stamp) => {
      const doc = clientDoc({ stamp, structured: stamp === 4 });
      const res = await get(await start(doc, live));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { state: unknown; hasYState: boolean; live: boolean };
      expect(body.hasYState).toBe(true);
      expect(body.live).toBe(live);
      expect(body.state).toEqual(SAMPLE_STATE());
    });
  });

  it('answers an unknown document as empty', async () => {
    const res = await get(await start(null, false));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ hasYState: false });
  });
});
