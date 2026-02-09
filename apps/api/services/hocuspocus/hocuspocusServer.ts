import 'dotenv/config';
import { exec } from 'child_process';
import { createServer } from 'net';
import { promisify } from 'util';

import { Logger } from '@hocuspocus/extension-logger';
import { Server } from '@hocuspocus/server';
import * as Y from 'yjs';

import { createLogger } from '../../utils/logger.js';

import { authenticateConnection } from './auth.js';
import { PostgresPersistence } from './persistence.js';

const execAsync = promisify(exec);
const log = createLogger('HocuspocusServer');

const PORT = parseInt(process.env.HOCUSPOCUS_PORT || '1240', 10);
const HOST = process.env.HOCUSPOCUS_HOST || '0.0.0.0';

/**
 * Check if a port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

/**
 * Kill process using the specified port (Linux/Mac only)
 */
async function killProcessOnPort(port: number): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`lsof -ti :${port}`);
    const pids = stdout.trim().split('\n').filter(Boolean);

    if (pids.length > 0) {
      log.warn(`Found ${pids.length} process(es) on port ${port}, killing...`);
      for (const pid of pids) {
        try {
          await execAsync(`kill -9 ${pid}`);
          log.info(`Killed process ${pid} on port ${port}`);
        } catch {
          // Process may have already exited
        }
      }
      // Wait a moment for the port to be released
      await new Promise((resolve) => setTimeout(resolve, 500));
      return true;
    }
    return false;
  } catch {
    // No process found on port (lsof returns error)
    return false;
  }
}

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

    // Check if port is available, kill existing process if needed
    const portAvailable = await isPortAvailable(PORT);
    if (!portAvailable) {
      log.warn(`Port ${PORT} is already in use, attempting to free it...`);
      const killed = await killProcessOnPort(PORT);
      if (killed) {
        // Verify port is now available
        const nowAvailable = await isPortAvailable(PORT);
        if (!nowAvailable) {
          throw new Error(`Port ${PORT} is still in use after kill attempt`);
        }
        log.info(`Port ${PORT} is now available`);
      } else {
        throw new Error(`Port ${PORT} is in use and could not be freed`);
      }
    }

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
          const { documentName, requestHeaders, requestParameters, token } = data;
          const connection = (data as any).connection;

          log.info(
            `[Auth-Hook] onAuthenticate called for document: ${documentName}, hasToken: ${!!token}`
          );

          const authResult = await authenticateConnection({
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
          log.error(`[Auth] Authentication error: ${err.message}`);
          throw err;
        }
      },

      /**
       * Load document from database
       * Called when first client connects to a document
       */
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

      /**
       * Store document updates to database
       * Called when document changes
       */
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

        // Always extract preview from the in-memory Y.Doc (independent of persistence)
        persistence.updateContentPreview(documentName, document);
      },

      /**
       * Connection established
       */
      async onConnect(data) {
        const { documentName, requestParameters } = data;
        log.info(`[Connect] Client connected to document: ${documentName}`);
      },

      /**
       * Connection closed
       */
      async onDisconnect(data) {
        const { documentName } = data;
        log.info(`[Disconnect] Client disconnected from document: ${documentName}`);
      },

      /**
       * Request received
       */
      async onRequest(data) {
        const documentName = (data as any).documentName;
        log.info(`[Request] Received request for: ${documentName}`);
      },

      /**
       * Upgrade request
       */
      async onUpgrade(data) {
        const documentName = (data as any).documentName;
        log.info(`[Upgrade] WebSocket upgrade request for: ${documentName}`);
      },

      /**
       * Document changed
       */
      async onChange(data) {
        const { documentName } = data;
        log.debug(`[Change] Document ${documentName} changed`);
      },

      /**
       * Server listening
       */
      async onListen() {
        log.info(`Hocuspocus server listening on ${HOST}:${PORT}`);
        log.info('WebSocket endpoint: ws://' + HOST + ':' + PORT);
      },

      /**
       * Error handler
       */
      async onStateless(data) {},

      /**
       * Destroy handler
       */
      async onDestroy() {
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
    const err = error instanceof Error ? error : new Error(String(error));
    log.error('Fatal error starting Hocuspocus server: ' + err.message);
    process.exit(1);
  });
}
