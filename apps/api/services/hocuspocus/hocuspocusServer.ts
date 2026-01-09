import { Server } from '@hocuspocus/server';
import { Logger } from '@hocuspocus/extension-logger';
import { createLogger } from '../../utils/logger.js';
import { PostgresPersistence } from './persistence.js';
import { authenticateConnection } from './auth.js';

const log = createLogger('HocuspocusServer');

const PORT = parseInt(process.env.HOCUSPOCUS_PORT || '1240', 10);
const HOST = process.env.HOCUSPOCUS_HOST || '0.0.0.0';

/**
 * Hocuspocus WebSocket Server for Real-Time Collaborative Editing
 *
 * This server handles Y.js CRDT synchronization for Google Docs-like collaboration:
 * - Multiple users can edit the same document simultaneously
 * - Changes are synchronized in real-time via WebSocket
 * - Document state is persisted to PostgreSQL
 * - Authentication via Keycloak session cookies
 */

export async function startHocuspocusServer(): Promise<void> {
  try {
    log.info('Initializing Hocuspocus server...');

    // Initialize PostgreSQL persistence
    const persistence = new PostgresPersistence();

    // Create Hocuspocus server
    const server = new Server({
      port: PORT,
      address: HOST,

      // Extensions
      extensions: [
        new Logger({
          onLoadDocument: false, // Too verbose
          onChange: false, // Too verbose
          onConnect: true,
          onDisconnect: true,
          onUpgrade: true,
          onRequest: false,
          onListen: true,
          onDestroy: true,
          onConfigure: true,
        }),
      ],

      /**
       * Authentication hook
       * Verify user has permission to access document via session cookie
       */
      async onAuthenticate(data) {
        try {
          console.log(`[Auth-Hook] ========== onAuthenticate CALLED ==========`);
          console.log(`[Auth-Hook] Data keys: ${JSON.stringify(Object.keys(data))}`);

          const { documentName, requestHeaders, requestParameters, connection } = data;

          console.log(`[Auth-Hook] documentName: ${documentName}`);
          log.info(`[Auth-Hook] onAuthenticate called for document: ${documentName}`);

          const authResult = await authenticateConnection({
            documentName,
            requestHeaders,
            requestParameters,
            connection,
          });

          console.log(`[Auth-Hook] authResult: ${JSON.stringify(authResult)}`);

          if (!authResult.authenticated) {
            console.log(`[Auth-Hook] Authentication FAILED: ${authResult.reason}`);
            log.warn(`[Auth] Authentication failed for document ${documentName}: ${authResult.reason}`);
            throw new Error(authResult.reason || 'Authentication failed');
          }

          console.log(`[Auth-Hook] Authentication SUCCESS for user: ${authResult.userId}`);
          log.info(`[Auth] User ${authResult.userId} authenticated for document ${documentName}`);

          // Return authentication result with context
          return {
            user: {
              id: authResult.userId,
              name: authResult.userName,
            },
            // Store read-only status in connection context
            context: {
              readOnly: authResult.readOnly || false,
            },
          };
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          console.log(`[Auth-Hook] EXCEPTION in onAuthenticate: ${err.message}`);
          console.log(`[Auth-Hook] Stack: ${err.stack}`);
          log.error(`[Auth] Authentication error: ${err.message}`);
          throw err;
        }
      },

      /**
       * Load document from database
       * Called when first client connects to a document
       */
      async onLoadDocument(data) {
        const { documentName } = data;
        log.debug(`[Load] Loading document: ${documentName}`);

        try {
          const documentData = await persistence.loadDocument(documentName);

          if (documentData) {
            log.info(`[Load] Document ${documentName} loaded successfully (${documentData.length} bytes)`);
            return documentData;
          } else {
            log.info(`[Load] Document ${documentName} not found, will create new`);
            return null;
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          log.error(`[Load] Error loading document ${documentName}: ${err.message}`);
          throw err;
        }
      },

      /**
       * Store document updates to database
       * Called when document changes
       */
      async onStoreDocument(data) {
        const { documentName, state } = data;
        log.debug(`[Store] Storing document: ${documentName}`);

        try {
          await persistence.storeDocument(documentName, state);
          log.debug(`[Store] Document ${documentName} stored successfully`);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          log.error(`[Store] Error storing document ${documentName}: ${err.message}`);
          // Don't throw - we don't want to crash the server on storage errors
        }
      },

      /**
       * Connection established
       */
      onConnect(data) {
        const { documentName, requestParameters } = data;
        console.log(`[Connect] Client connected to document: ${documentName}`);
        log.info(`[Connect] Client connected to document: ${documentName}`);
      },

      /**
       * Connection closed
       */
      onDisconnect(data) {
        const { documentName } = data;
        console.log(`[Disconnect] Client disconnected from document: ${documentName}`);
        log.info(`[Disconnect] Client disconnected from document: ${documentName}`);
      },

      /**
       * Request received
       */
      onRequest(data) {
        console.log(`[Request] Received request for: ${data.documentName}`);
        log.info(`[Request] Received request for: ${data.documentName}`);
      },

      /**
       * Upgrade request
       */
      onUpgrade(data) {
        console.log(`[Upgrade] WebSocket upgrade request`);
        console.log(`[Upgrade] documentName: ${data.documentName}`);
        console.log(`[Upgrade] All data keys: ${JSON.stringify(Object.keys(data))}`);
        console.log(`[Upgrade] request.url: ${data.request?.url}`);
        log.info(`[Upgrade] WebSocket upgrade request for: ${data.documentName}`);
      },

      /**
       * Document changed
       */
      onChange(data) {
        const { documentName } = data;
        log.debug(`[Change] Document ${documentName} changed`);
      },

      /**
       * Server listening
       */
      onListen() {
        log.info(`Hocuspocus server listening on ${HOST}:${PORT}`);
        log.info('WebSocket endpoint: ws://' + HOST + ':' + PORT);
      },

      /**
       * Error handler
       */
      async onStateless(data) {
        console.log(`[Stateless] Stateless message received`);
        console.log(`[Stateless] Data: ${JSON.stringify(Object.keys(data))}`);
      },

      /**
       * Destroy handler
       */
      onDestroy() {
        console.log('Hocuspocus server shutting down...');
        log.info('Hocuspocus server shutting down...');
      },
    });

    // Start listening on the port
    server.listen();
    log.info(`Hocuspocus WebSocket server started on ${HOST}:${PORT}`);

    // Graceful shutdown
    process.on('SIGINT', async () => {
      log.info('SIGINT received, shutting down gracefully...');
      await server.destroy();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      log.info('SIGTERM received, shutting down gracefully...');
      await server.destroy();
      process.exit(0);
    });

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error(`Failed to start Hocuspocus server: ${err.message}`);
    throw err;
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startHocuspocusServer().catch((error) => {
    console.error('Fatal error starting Hocuspocus server:', error);
    process.exit(1);
  });
}
