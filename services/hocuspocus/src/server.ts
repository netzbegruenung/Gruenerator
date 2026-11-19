import { Logger } from '@hocuspocus/extension-logger';
import { Server } from '@hocuspocus/server';
import * as Y from 'yjs';

import { countCanvasPages } from './canvasPageCount.js';
import { closeRoomConnections } from './internalApi.js';
import { createLogger } from './logger.js';
import {
  SITE_DOC_MAX_BYTES,
  SITE_ROOM_PREFIX,
  SITE_TOO_LARGE,
  siteIdFromRoom,
  siteIsLive,
  siteRoomGate,
} from './siteRooms.js';

import type { HocuspocusConfig } from './types.js';

const log = createLogger('HocuspocusServer');

/** Close code sent to the connections of a site draft that outgrew the store cap. */
const SITE_TOO_LARGE_CLOSE = { code: 4413, reason: SITE_TOO_LARGE };

export function createHocuspocusServer(config: HocuspocusConfig): Server {
  const { port, host, persistence, auth, db } = config;
  // Site rooms over the cap that were already logged; cleared once a store fits again.
  const oversizedSiteRooms = new Set<string>();
  // Site rooms whose site is gone that were already logged; cleared if it is live again.
  const goneSiteRooms = new Set<string>();

  const server = new Server({
    port,
    address: host,

    extensions: [
      new Logger({
        onLoadDocument: false,
        onChange: false,
        onConnect: true,
        onDisconnect: true,
        onUpgrade: true,
        onRequest: false,
        onDestroy: true,
        onConfigure: true,
      }),
    ],

    async onAuthenticate(data) {
      try {
        const { documentName, requestHeaders, requestParameters, token } = data;

        log.info(
          `[Auth-Hook] onAuthenticate called for document: ${documentName}, hasToken: ${!!token}`
        );

        const authResult = await auth.authenticateConnection({
          documentName,
          requestHeaders,
          requestParameters,
          token,
        });

        if (!authResult.authenticated) {
          log.warn(
            `[Auth] Authentication failed for document ${documentName}: ${authResult.reason}`
          );
          throw new Error(authResult.reason || 'Authentication failed');
        }

        if (documentName.startsWith(SITE_ROOM_PREFIX)) {
          const reason = await siteRoomGate(data.instance.documents.get(documentName) ?? null, () =>
            persistence.hasStoredState(documentName)
          );
          if (reason) {
            log.warn(`[Auth] Site room ${documentName} refused: ${reason}`);
            throw new Error(reason);
          }
        }

        log.info(`[Auth] User ${authResult.userId} authenticated for document ${documentName}`);

        // Server-side write enforcement: Hocuspocus only blocks incoming sync
        // writes when connectionConfig.readOnly is set — the context flag below
        // is informational and never consulted by the framework.
        data.connectionConfig.readOnly = authResult.readOnly || false;

        // Becomes the connection context; closeRoomConnections (internalApi.ts)
        // reads `user.id` to close one user's connections after an access change.
        return {
          user: {
            id: authResult.userId,
            name: authResult.userName,
          },
          context: {
            readOnly: authResult.readOnly || false,
          },
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.error(`[Auth] Authentication error: ${err.message}`);
        throw err;
      }
    },

    async onLoadDocument(data) {
      const { documentName, document } = data;

      // chat-* (broadcast-only) and group-presence-* (awareness-only) rooms
      // are not persisted server-side. chat-* still broadcasts Y updates
      // between connected peers (used for live multi-user chat); Postgres
      // remains the source of truth for chat messages via /api/chat-service.
      if (documentName.startsWith('chat-') || documentName.startsWith('group-presence-')) {
        log.debug(`[Load] Skipping persistence for ephemeral room: ${documentName}`);
        return;
      }

      log.debug(`[Load] Loading document: ${documentName}`);

      try {
        const documentData = await persistence.loadDocument(documentName);

        if (documentData) {
          Y.applyUpdate(document, documentData);
          log.info(
            `[Load] Document ${documentName} loaded successfully (${documentData.length} bytes)`
          );
        } else {
          log.warn(`[Load] No persisted state for ${documentName} — new document`);
        }

        // A site draft is seeded by the API (/internal/site/:siteId/seed), never by a template.
        if (documentName.startsWith(SITE_ROOM_PREFIX)) return;

        // Yjs-native safety check: only inject template when the fragment is truly empty.
        // BlockNote always maintains ≥1 block even when the user clears content,
        // so fragment.length === 0 means this document was never initialized.
        // A canvas never has that fragment and no template, so skip its lookup.
        const fragment = document.getXmlFragment('document-store');
        log.info(`[Load] Fragment check for ${documentName}: ${fragment.length} children`);
        if (fragment.length === 0 && countCanvasPages(document) === null) {
          log.info(`[Load] Document ${documentName} fragment empty, injecting template`);
          await persistence.initializeWithTemplate(documentName, document);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.error(
          `[Load] Error loading document ${documentName}: ${err.message} — rejecting connection`
        );
        throw err;
      }
    },

    async onStoreDocument(data) {
      const { documentName, document } = data;

      if (documentName.startsWith('chat-') || documentName.startsWith('group-presence-')) {
        return;
      }

      const state = Y.encodeStateAsUpdate(document);

      // Site rows are no collaborative_documents: no page count, updated_at or preview.
      if (documentName.startsWith(SITE_ROOM_PREFIX)) {
        // Access is only checked at connect: a site trashed or purged meanwhile must not
        // get new Yjs rows from a connection that is still open. A non-uuid room has no
        // site to look up and is left to the persistence key as before.
        const siteId = siteIdFromRoom(documentName);
        if (siteId) {
          let live: boolean;
          try {
            live = await siteIsLive(db, siteId);
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            log.error(`[Store] Site lookup failed for ${documentName}: ${err.message}`);
            return;
          }
          if (!live) {
            if (!goneSiteRooms.has(documentName)) {
              goneSiteRooms.add(documentName);
              log.warn(`[Store] site ${siteId} gone, dropping store for ${documentName}`);
            }
            closeRoomConnections(server.hocuspocus, [documentName], null);
            return;
          }
          goneSiteRooms.delete(documentName);
        }
        if (state.length > SITE_DOC_MAX_BYTES) {
          if (!oversizedSiteRooms.has(documentName)) {
            oversizedSiteRooms.add(documentName);
            log.error(
              `[Store] Site draft ${documentName} is ${state.length} bytes, over the ${SITE_DOC_MAX_BYTES}-byte cap — not persisted, closing its connections`
            );
          }
          // The edits past the cap cannot be stored; closing stops them from piling up in
          // memory, and the gate in onAuthenticate refuses a reconnect while the doc is live.
          for (const connection of document.getConnections()) {
            connection.close(SITE_TOO_LARGE_CLOSE);
          }
          return;
        }
        oversizedSiteRooms.delete(documentName);
        try {
          await persistence.storeDocument(documentName, state);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          log.error(`[Store] FAILED to persist ${documentName}: ${err.message}`);
        }
        return;
      }

      log.info(
        `[CanvasCollab][Store] onStoreDocument fired for ${documentName} (${state.length} bytes)`
      );

      try {
        await persistence.storeDocument(documentName, state);
        log.info(`[CanvasCollab][Store] persisted ${documentName} (${state.length} bytes)`);
        await persistence.updateCanvasPageCount(documentName, document);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.error(`[CanvasCollab][Store] FAILED to persist ${documentName}: ${err.message}`);
      }

      void persistence.touchUpdatedAt(documentName);
      void persistence.updateContentPreview(documentName, document);
    },

    async onConnect(data) {
      const { documentName } = data;
      log.info(`[Connect] Client connected to document: ${documentName}`);
    },

    async onDisconnect(data) {
      const { documentName } = data;
      log.info(`[Disconnect] Client disconnected from document: ${documentName}`);
    },

    async onRequest(_data) {},

    async onUpgrade(_data) {},

    async onChange(data) {
      const { documentName, update } = data;
      const context = data.context as { readOnly?: boolean } | undefined;
      log.info(
        `[CanvasCollab][Change] ${documentName} update arrived (${(update as Uint8Array)?.length ?? 0} bytes, readOnly: ${context?.readOnly ?? 'unknown'})`
      );
    },

    async onListen() {
      log.info(`Hocuspocus server listening on ${host}:${port}`);
      log.info('WebSocket endpoint: ws://' + host + ':' + port);

      // Sheets/presentations/boards created before the preview pipeline have an
      // empty `content` column until their next store — fill those on every boot
      // (idempotent, matches nothing once previews exist).
      persistence.backfillMissingTypedPreviews().catch((err) => {
        log.error(`[Backfill] Error during typed-preview backfill: ${err}`);
      });

      // Full preview backfill loads every document from Postgres — opt-in only,
      // for one-off repairs. Previews stay fresh via updateContentPreview on store.
      if (process.env.HOCUSPOCUS_BACKFILL_PREVIEWS === 'true') {
        persistence.backfillAllPreviews().catch((err) => {
          log.error(`[Backfill] Error during startup backfill: ${err}`);
        });
      }
    },

    async onStateless(_data) {},

    async onDestroy() {
      log.info('Hocuspocus server shutting down...');
    },
  });

  return server;
}
