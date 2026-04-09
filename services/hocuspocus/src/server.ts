import { Logger } from '@hocuspocus/extension-logger';
import { Server } from '@hocuspocus/server';
import * as Y from 'yjs';

import { createLogger } from './logger.js';

import type { HocuspocusConfig } from './types.js';

const log = createLogger('HocuspocusServer');

export function createHocuspocusServer(config: HocuspocusConfig): Server {
  const { port, host, persistence, auth } = config;

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
        const connection = (data as unknown as { connection: unknown }).connection;

        log.info(
          `[Auth-Hook] onAuthenticate called for document: ${documentName}, hasToken: ${!!token}`
        );

        const authResult = await auth.authenticateConnection({
          documentName,
          requestHeaders,
          requestParameters,
          connection,
          token,
        });

        if (!authResult.authenticated) {
          log.warn(
            `[Auth] Authentication failed for document ${documentName}: ${authResult.reason}`
          );
          throw new Error(authResult.reason || 'Authentication failed');
        }

        log.info(`[Auth] User ${authResult.userId} authenticated for document ${documentName}`);

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

      if (documentName.startsWith('chat-') || documentName.startsWith('group-presence-')) {
        log.debug(`[Load] Skipping persistence for awareness-only room: ${documentName}`);
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

        // Yjs-native safety check: only inject template when the fragment is truly empty.
        // BlockNote always maintains ≥1 block even when the user clears content,
        // so fragment.length === 0 means this document was never initialized.
        const fragment = document.getXmlFragment('document-store');
        log.info(`[Load] Fragment check for ${documentName}: ${fragment.length} children`);
        if (fragment.length === 0) {
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
      log.debug(`[Store] Storing document: ${documentName}`);

      try {
        await persistence.storeDocument(documentName, state);
        log.debug(`[Store] Document ${documentName} stored successfully`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.error(`[Store] Error storing document ${documentName}: ${err.message}`);
      }

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
      const { documentName, document } = data;
      const stateSize = Y.encodeStateAsUpdate(document).length;
      const fragment = document.getXmlFragment('document-store');
      log.info(
        `[Change] Document ${documentName} changed | stateSize=${stateSize} bytes | fragments=${fragment.length}`
      );
    },

    async onListen() {
      log.info(`Hocuspocus server listening on ${host}:${port}`);
      log.info('WebSocket endpoint: ws://' + host + ':' + port);

      // One-time backfill: regenerate previews with fixed heading conversion
      persistence.backfillAllPreviews().catch((err) => {
        log.error(`[Backfill] Error during startup backfill: ${err}`);
      });
    },

    async onStateless(_data) {},

    async onDestroy() {
      log.info('Hocuspocus server shutting down...');
    },
  });

  return server;
}
