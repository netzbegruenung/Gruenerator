import express from 'express';
import * as Y from 'yjs';

import { createLogger } from './logger.js';

import type { PostgresPersistence } from './persistence.js';
import type { Server } from '@hocuspocus/server';

const log = createLogger('InternalApi');

// Y.Doc keys for canvas documents. Duplicated from
// packages/canvas-editor/src/collab/ydocKeys.ts on purpose — per CLAUDE.md the
// Hocuspocus service has zero cross-package deps.
const KEY_FORM_STATE = 'formState';
const KEY_PAGES = 'pages';
const KEY_STATE = 'state';

const TRANSACT_ORIGIN = 'gruenerator-internal-canvas-api';

interface InternalApiDeps {
  server: Server;
  persistence: PostgresPersistence;
}

export function readMergedState(doc: Y.Doc): {
  state: Record<string, unknown>;
  hasYState: boolean;
} {
  const formState = doc.getMap<unknown>(KEY_FORM_STATE);
  const pages = doc.getArray<Y.Map<unknown>>(KEY_PAGES);

  const merged: Record<string, unknown> = {};
  const firstPage = pages.length > 0 ? pages.get(0) : null;
  const firstPageState = firstPage?.get(KEY_STATE);
  if (firstPageState instanceof Y.Map) {
    for (const [k, v] of (firstPageState as Y.Map<unknown>).entries()) merged[k] = v;
  }
  // Root formState wins: it is where the studio writes template-field edits.
  formState.forEach((value, key) => {
    merged[key] = value;
  });

  return { state: merged, hasYState: formState.size > 0 || pages.length > 0 };
}

export function applyPatchToDoc(
  doc: Y.Doc,
  patch: Record<string, unknown>,
  seedState: Record<string, unknown> | null
): void {
  doc.transact(() => {
    const formState = doc.getMap<unknown>(KEY_FORM_STATE);
    const pages = doc.getArray<Y.Map<unknown>>(KEY_PAGES);

    // Never-opened doc: seed the FULL state first so a later studio open
    // (which only seeds when the map is empty) doesn't half-seed the form.
    if (formState.size === 0 && pages.length === 0 && seedState) {
      for (const [k, v] of Object.entries(seedState)) formState.set(k, v);
    }

    for (const [k, v] of Object.entries(patch)) formState.set(k, v);

    // Mirror into every page's state map — pages[i].state is what a mounted
    // studio page reads (and observes) for template fields.
    for (let i = 0; i < pages.length; i++) {
      const pageState = pages.get(i).get(KEY_STATE);
      if (pageState instanceof Y.Map) {
        for (const [k, v] of Object.entries(patch)) (pageState as Y.Map<unknown>).set(k, v);
      }
    }
  }, TRANSACT_ORIGIN);
}

/**
 * Server-to-server canvas state endpoints used by the API's
 * `canvasStateService` (chat sharepic editing). Mounted on the health Express
 * app; enabled only when HOCUSPOCUS_INTERNAL_TOKEN is configured.
 */
export function registerInternalApi(app: express.Express, deps: InternalApiDeps): void {
  const token = process.env.HOCUSPOCUS_INTERNAL_TOKEN;
  if (!token) {
    log.warn('HOCUSPOCUS_INTERNAL_TOKEN not set — internal canvas API disabled');
    return;
  }

  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));
  router.use((req, res, next) => {
    if (req.headers['x-internal-token'] !== token) {
      res.status(401).json({ error: 'invalid internal token' });
      return;
    }
    next();
  });

  router.get('/canvas/:documentId/state', async (req, res) => {
    const { documentId } = req.params;
    try {
      // Live doc first (includes unsaved in-flight edits); otherwise decode
      // the persisted Yjs state without opening a direct connection (a pure
      // read must not create + persist an empty doc).
      const liveDoc = deps.server.hocuspocus.documents.get(documentId);
      if (liveDoc) {
        res.json({ ...readMergedState(liveDoc), live: true });
        return;
      }
      const stored = await deps.persistence.loadDocument(documentId);
      if (!stored) {
        res.json({ state: {}, hasYState: false, live: false });
        return;
      }
      const doc = new Y.Doc();
      Y.applyUpdate(doc, stored);
      res.json({ ...readMergedState(doc), live: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`GET state failed for ${documentId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  router.post('/canvas/:documentId/state', async (req, res) => {
    const { documentId } = req.params;
    const body = req.body as {
      patch?: Record<string, unknown>;
      seedState?: Record<string, unknown>;
    };
    if (!body?.patch || typeof body.patch !== 'object' || Array.isArray(body.patch)) {
      res.status(400).json({ error: 'patch (object) is required' });
      return;
    }

    try {
      const connection = await deps.server.hocuspocus.openDirectConnection(documentId);
      try {
        let result: { state: Record<string, unknown>; hasYState: boolean } | null = null;
        await connection.transact((doc) => {
          applyPatchToDoc(doc, body.patch!, body.seedState ?? null);
          result = readMergedState(doc);
        });
        log.info(
          `Applied canvas patch to ${documentId} (${Object.keys(body.patch).length} key(s))`
        );
        res.json({ ok: true, ...(result ?? { state: {}, hasYState: false }) });
      } finally {
        await connection.disconnect();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`POST state failed for ${documentId}: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  app.use('/internal', router);
  log.info('Internal canvas API registered at /internal/canvas/:documentId/state');
}
