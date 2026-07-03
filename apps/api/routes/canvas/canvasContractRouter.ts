/**
 * ts-rest contract router for canvas-document CRUD.
 *
 * Replaces the legacy Express routers (canvasController.ts + resizeController.ts
 * + cloneController.ts). Covers:
 *   - GET    /api/canvas
 *   - POST   /api/canvas
 *   - POST   /api/canvas/:id/resize
 *   - POST   /api/canvas/:id/clone
 *   - GET    /api/canvas/:id
 *   - PATCH  /api/canvas/:id
 *   - DELETE /api/canvas/:id
 *
 * requireAuth + authenticatedReadLimiter are applied at the /api/canvas prefix
 * in routes.ts (createExpressEndpoints registers handlers directly on the app,
 * so the prefix middleware must run first).
 */

import { canvasContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  cloneCanvas,
  createCanvas,
  deleteCanvas,
  getCanvas,
  listCanvases,
  resizeCanvas,
  updateCanvas,
  type CreateCanvasInput,
  type UpdateCanvasInput,
} from '../../services/canvas/canvasRepository.js';
import {
  applyCanvasStatePatch,
  applyDeckChanges,
  getCurrentCanvasState,
  getCurrentDeckState,
  type CanvasPageDef,
} from '../../services/canvas/canvasStateService.js';
import {
  getCanvasVersion,
  getLatestCanvasVersionNumber,
  insertCanvasVersion,
  listCanvasVersions,
} from '../../services/canvas/canvasVersionRepository.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';
import { mintCanvasForVariant } from '../chat/services/sharepicEditService.js';
import { getServerFormat } from '../exports/pageConstants.js';

import type { Application } from 'express';

const log = createLogger('canvasContractRouter');

const isCanvasPageDefArray = (v: unknown): v is CanvasPageDef[] =>
  Array.isArray(v) &&
  v.every(
    (p) =>
      !!p &&
      typeof p === 'object' &&
      typeof (p as CanvasPageDef).id === 'string' &&
      typeof (p as CanvasPageDef).configId === 'string' &&
      typeof (p as CanvasPageDef).state === 'object'
  );

const s = initServer();

export const canvasContractRouter = s.router(canvasContract, {
  list: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const canvases = await listCanvases(userId);
      return { status: 200 as const, body: canvases };
    } catch (error) {
      const err = error as Error;
      log.error('[canvas.list] Error:', err);
      return {
        status: 500 as const,
        body: { error: 'Failed to list canvases', details: err.message },
      };
    }
  },

  create: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const b = args.body;
      const input: CreateCanvasInput = {
        template_type: b.template_type,
        ...(b.title !== undefined ? { title: b.title } : {}),
        ...(b.base_template_id !== undefined ? { base_template_id: b.base_template_id } : {}),
        ...(b.initial_state !== undefined ? { initial_state: b.initial_state } : {}),
        ...(b.page_count !== undefined ? { page_count: b.page_count } : {}),
        ...(b.format !== undefined ? { format: b.format } : {}),
      };
      const canvas = await createCanvas(userId, input);
      return { status: 201 as const, body: canvas };
    } catch (error) {
      const err = error as Error;
      log.error('[canvas.create] Error:', err);
      return {
        status: 500 as const,
        body: { error: 'Failed to create canvas', details: err.message },
      };
    }
  },

  fromVariant: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { canvasType, initialProps, threadId, variantId } = args.body;
      const { canvasId } = await mintCanvasForVariant({
        userId,
        threadId,
        variantId,
        canvasType,
        initialProps,
      });
      return { status: 201 as const, body: { canvasId } };
    } catch (error) {
      const err = error as Error;
      log.error('[canvas.fromVariant] Error:', err);
      return {
        status: 500 as const,
        body: { error: 'Failed to mint canvas from variant', details: err.message },
      };
    }
  },

  resize: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { formatId, title } = args.body;
      if (!getServerFormat(formatId)) {
        return { status: 400 as const, body: { error: `Unbekanntes Format '${formatId}'` } };
      }
      const result = await resizeCanvas(args.params.id, userId, formatId, title);
      if (result.kind === 'not_found') {
        return { status: 404 as const, body: { error: 'Canvas not found' } };
      }
      if (result.kind === 'forbidden') {
        return { status: 403 as const, body: { error: 'Access denied' } };
      }
      return { status: 201 as const, body: { newCanvasId: result.newCanvasId } };
    } catch (error) {
      const err = error as Error;
      log.error('[canvas.resize] Error:', err);
      return {
        status: 500 as const,
        body: { error: 'Failed to resize canvas', details: err.message },
      };
    }
  },

  clone: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const result = await cloneCanvas(args.params.id, userId);
      if (result.kind === 'not_found') {
        return { status: 404 as const, body: { error: 'Canvas not found' } };
      }
      if (result.kind === 'forbidden') {
        return { status: 403 as const, body: { error: 'Access denied' } };
      }
      return {
        status: 201 as const,
        body:
          result.accessMethod !== undefined
            ? { newCanvasId: result.newCanvasId, accessMethod: result.accessMethod }
            : { newCanvasId: result.newCanvasId },
      };
    } catch (error) {
      const err = error as Error;
      log.error('[canvas.clone] Error:', err);
      return {
        status: 500 as const,
        body: { error: 'Failed to clone canvas', details: err.message },
      };
    }
  },

  getState: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const access = await getCanvas(args.params.id, userId);
      if (access.kind === 'not_found') {
        return { status: 404 as const, body: { error: 'Canvas not found' } };
      }
      if (access.kind === 'forbidden') {
        return { status: 403 as const, body: { error: 'Access denied' } };
      }
      const current = await getCurrentCanvasState(args.params.id);
      const version = await getLatestCanvasVersionNumber(args.params.id);
      // Deck canvases additionally expose their per-slide states.
      const isDeck = access.canvas.template_type === 'slider';
      const deckPages = isDeck ? (await getCurrentDeckState(args.params.id)).pages : [];
      return {
        status: 200 as const,
        body: {
          state: current.state,
          source: current.source,
          version,
          ...(deckPages.length > 0 ? { pages: deckPages.map((p) => p.state) } : {}),
        },
      };
    } catch (error) {
      const err = error as Error;
      log.error('[canvas.getState] Error:', err);
      return {
        status: 500 as const,
        body: { error: 'Failed to fetch canvas state', details: err.message },
      };
    }
  },

  listVersions: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const access = await getCanvas(args.params.id, userId);
      if (access.kind === 'not_found') {
        return { status: 404 as const, body: { error: 'Canvas not found' } };
      }
      if (access.kind === 'forbidden') {
        return { status: 403 as const, body: { error: 'Access denied' } };
      }
      const versions = await listCanvasVersions(args.params.id);
      return { status: 200 as const, body: { versions } };
    } catch (error) {
      const err = error as Error;
      log.error('[canvas.listVersions] Error:', err);
      return {
        status: 500 as const,
        body: { error: 'Failed to list canvas versions', details: err.message },
      };
    }
  },

  getVersion: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const access = await getCanvas(args.params.id, userId);
      if (access.kind === 'not_found') {
        return { status: 404 as const, body: { error: 'Canvas not found' } };
      }
      if (access.kind === 'forbidden') {
        return { status: 403 as const, body: { error: 'Access denied' } };
      }
      const snapshot = await getCanvasVersion(args.params.id, args.params.version);
      if (!snapshot) {
        return { status: 404 as const, body: { error: 'Version not found' } };
      }
      return { status: 200 as const, body: snapshot };
    } catch (error) {
      const err = error as Error;
      log.error('[canvas.getVersion] Error:', err);
      return {
        status: 500 as const,
        body: { error: 'Failed to fetch canvas version', details: err.message },
      };
    }
  },

  restoreVersion: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const access = await getCanvas(args.params.id, userId);
      if (access.kind === 'not_found') {
        return { status: 404 as const, body: { error: 'Canvas not found' } };
      }
      if (access.kind === 'forbidden') {
        return { status: 403 as const, body: { error: 'Access denied' } };
      }
      const snapshot = await getCanvasVersion(args.params.id, args.params.version);
      if (!snapshot) {
        return { status: 404 as const, body: { error: 'Version not found' } };
      }
      // Re-apply the snapshot as a forward patch — never rewinds Yjs history.
      // Deck versions ({ pages: [...] }) replace the page set instead.
      const versionPages = (snapshot.state as { pages?: unknown }).pages;
      if (isCanvasPageDefArray(versionPages) && versionPages.length > 0) {
        await applyDeckChanges(args.params.id, {
          seedPages: versionPages,
          replacePages: versionPages,
          newPages: versionPages,
        });
      } else {
        await applyCanvasStatePatch(args.params.id, snapshot.state, {
          seedState: snapshot.state,
        });
      }
      const newVersion = await insertCanvasVersion({
        canvasId: args.params.id,
        state: snapshot.state,
        summary: `Version ${snapshot.version} wiederhergestellt`,
        origin: 'restore',
        userId,
      });
      return { status: 200 as const, body: { version: newVersion, state: snapshot.state } };
    } catch (error) {
      const err = error as Error;
      log.error('[canvas.restoreVersion] Error:', err);
      return {
        status: 500 as const,
        body: { error: 'Failed to restore canvas version', details: err.message },
      };
    }
  },

  get: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const result = await getCanvas(args.params.id, userId);
      if (result.kind === 'not_found') {
        return { status: 404 as const, body: { error: 'Canvas not found' } };
      }
      if (result.kind === 'forbidden') {
        return { status: 403 as const, body: { error: 'Access denied' } };
      }
      return { status: 200 as const, body: result.canvas };
    } catch (error) {
      const err = error as Error;
      log.error('[canvas.get] Error:', err);
      return {
        status: 500 as const,
        body: { error: 'Failed to fetch canvas', details: err.message },
      };
    }
  },

  update: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const b = args.body;
      const patch: UpdateCanvasInput = {
        ...(b.title !== undefined ? { title: b.title } : {}),
        ...(b.thumbnail_url !== undefined ? { thumbnail_url: b.thumbnail_url } : {}),
        ...(b.page_count !== undefined ? { page_count: b.page_count } : {}),
        ...(b.format !== undefined ? { format: b.format } : {}),
      };
      const result = await updateCanvas(args.params.id, userId, patch);
      if (result.kind === 'not_found') {
        return { status: 404 as const, body: { error: 'Canvas not found' } };
      }
      if (result.kind === 'forbidden') {
        return { status: 403 as const, body: { error: 'Insufficient permissions' } };
      }
      return { status: 200 as const, body: { message: 'Canvas updated successfully' } };
    } catch (error) {
      const err = error as Error;
      log.error('[canvas.update] Error:', err);
      return {
        status: 500 as const,
        body: { error: 'Failed to update canvas', details: err.message },
      };
    }
  },

  remove: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const result = await deleteCanvas(args.params.id, userId);
      if (result.kind === 'not_found') {
        return { status: 404 as const, body: { error: 'Canvas not found' } };
      }
      if (result.kind === 'forbidden') {
        return { status: 403 as const, body: { error: 'Only owners can delete canvases' } };
      }
      return { status: 200 as const, body: { message: 'Canvas deleted successfully' } };
    } catch (error) {
      const err = error as Error;
      log.error('[canvas.remove] Error:', err);
      return {
        status: 500 as const,
        body: { error: 'Failed to delete canvas', details: err.message },
      };
    }
  },
});

/**
 * Mount the canvas CRUD contract router. Call from routes.ts AFTER the
 * canvas AI-suggest and chat-edit routers (so /api/canvas/ai-suggest and
 * /api/canvas/chat-edit/stream match first). requireAuth is applied at the
 * /api/canvas prefix.
 */
export function mountCanvasContractRouter(app: Application): void {
  createExpressEndpoints(canvasContract, canvasContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'canvasContract'),
  });
}
