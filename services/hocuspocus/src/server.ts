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
        const connection = (data as any).connection;

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
      log.debug(`[Load] Loading document: ${documentName}`);

      try {
        const documentData = await persistence.loadDocument(documentName);

        if (documentData) {
          Y.applyUpdate(document, documentData);
          log.info(
            `[Load] Document ${documentName} loaded successfully (${documentData.length} bytes)`
          );
        } else {
          log.info(`[Load] Document ${documentName} not found, will create new`);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.error(`[Load] Error loading document ${documentName}: ${err.message}`);
        throw err;
      }
    },

    async onStoreDocument(data) {
      const { documentName, document } = data;
      const state = Y.encodeStateAsUpdate(document);
      log.debug(`[Store] Storing document: ${documentName}`);

      try {
        await persistence.storeDocument(documentName, state);
        log.debug(`[Store] Document ${documentName} stored successfully`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.error(`[Store] Error storing document ${documentName}: ${err.message}`);
      }

      persistence.updateContentPreview(documentName, document);
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
      const { documentName } = data;
      log.debug(`[Change] Document ${documentName} changed`);
    },

    async onListen() {
      log.info(`Hocuspocus server listening on ${host}:${port}`);
      log.info('WebSocket endpoint: ws://' + host + ':' + port);
    },

    async onStateless(_data) {},

    async onDestroy() {
      log.info('Hocuspocus server shutting down...');
    },
  });

  return server;
}
