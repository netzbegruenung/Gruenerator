import http from 'http'
import { WebSocketServer } from 'ws'
import dotenv from 'dotenv'
import { postgresPersistence } from './utils/postgresPersistence.mjs';

// Add a random instance ID for logging
const instanceId = Math.random().toString(36).substring(2, 9);
console.log(`[Yjs Server Startup] Instance ${instanceId} starting script execution...`);

dotenv.config()

async function start() {
  console.log(`[Yjs Server Start Function] Instance ${instanceId} called start().`);
  const { setupWSConnection, setPersistence /* Assuming setPersistence exists or similar mechanism */ } = await import('@y/websocket-server/utils')
  console.log(`[Yjs Server] Imported setupWSConnection from @y/websocket-server/utils`);

  // Initialize and set persistence provider
  // This is a common pattern for y-websocket based servers.
  // If @y/websocket-server/utils doesn't export setPersistence, this part will need adjustment
  // based on how that specific library handles custom persistence.
  if (typeof setPersistence === 'function') {
    setPersistence(postgresPersistence);
    console.log(`[Yjs Server] Instance ${instanceId} Postgres persistence provider has been set.`);
  } else {
    console.warn(`[Yjs Server] Instance ${instanceId} 'setPersistence' function not found in '@y/websocket-server/utils'. 
                  The supabasePersistence module might not be correctly integrated if setupWSConnection 
                  does not implicitly use a globally set provider or accept it as a parameter.`);
    // As a fallback or alternative, one might need to pass persistence to setupWSConnection if it supports it,
    // or manage Y.Doc instances manually and call bindState before passing them to setupWSConnection.
    // For now, we proceed assuming setupWSConnection might pick it up or that a similar mechanism is in place.
  }

  const host = process.env.HOST || 'localhost'
  const port = process.env.YJS_PORT || 1234

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Yjs Websocket Server running')
  })

  // Add an explicit error handler for the server
  server.on('error', (err) => {
    console.error(`[Yjs Server] Instance ${instanceId} HTTP Server Error: ${err.message}`);
    if (err.code === 'EADDRINUSE') {
      console.error(`[Yjs Server] Instance ${instanceId} Port ${port} is already in use. Ensure no other yjsServer or process is running on this port.`);
      process.exit(1); // Exit the process if port is in use
    }
  });

  const wss = new WebSocketServer({ server })
  console.log(`[Yjs Server] Instance ${instanceId} WebSocketServer initialized and attached to HTTP server.`);

  // Track active connections for proper cleanup
  const connections = new Set();

  wss.on('connection', (conn, req) => {
    console.log(`[Yjs Server] Instance ${instanceId} New WebSocket connection received.`);
    connections.add(conn);
    
    conn.on('close', () => {
      connections.delete(conn);
    });
    
    // The documentName is usually extracted from req.url (e.g., /:documentName)
    // setupWSConnection from y-websocket typically handles this.
    // We rely on setupWSConnection to use the configured persistence provider.
    setupWSConnection(conn, req);
  });

  console.log(`[Yjs Server] Instance ${instanceId} Attempting to listen on ws://${host}:${port}`);
  server.listen(port, host, () =>
    console.log(`[Yjs Server] Instance ${instanceId} Running on ws://${host}:${port}`)
  )
  console.log(`[Yjs Server] Instance ${instanceId} Called server.listen()`);

  // Graceful shutdown
  const gracefulShutdown = async () => {
    console.log(`[Yjs Server] Instance ${instanceId} Received kill signal, shutting down gracefully...`);
    
    try {
      // Close all active WebSocket connections
      console.log(`[Yjs Server] Instance ${instanceId} Step 1: Closing ${connections.size} active connections...`);
      connections.forEach((conn, index) => {
        console.log(`[Yjs Server] Instance ${instanceId} Terminating connection ${index + 1}/${connections.size}`);
        if (conn.readyState === conn.OPEN) {
          conn.terminate();
        }
      });
      console.log(`[Yjs Server] Instance ${instanceId} Step 1 completed: All connections terminated`);
      
      // Clean up persistence layer (clear all timeouts)
      console.log(`[Yjs Server] Instance ${instanceId} Step 2: Starting persistence cleanup...`);
      if (postgresPersistence.cleanup) {
        await postgresPersistence.cleanup();
        console.log(`[Yjs Server] Instance ${instanceId} Step 2 completed: Persistence cleanup finished`);
      } else {
        console.log(`[Yjs Server] Instance ${instanceId} Step 2 skipped: No cleanup function available`);
      }
      
      // Close WebSocket server
      console.log(`[Yjs Server] Instance ${instanceId} Step 3: Closing WebSocket server...`);
      if (wss) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.error(`[Yjs Server] Instance ${instanceId} Step 3 timeout: WebSocket server close timed out`);
            reject(new Error('WebSocket server close timeout'));
          }, 5000);
          
          wss.close(() => { 
            clearTimeout(timeout);
            console.log(`[Yjs Server] Instance ${instanceId} Step 3 completed: WebSocket server closed`);
            resolve();
          });
        });
      } else {
        console.log(`[Yjs Server] Instance ${instanceId} Step 3 skipped: No WebSocket server to close`);
      }
      
      // Close HTTP server
      console.log(`[Yjs Server] Instance ${instanceId} Step 4: Closing HTTP server...`);
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.error(`[Yjs Server] Instance ${instanceId} Step 4 timeout: HTTP server close timed out`);
          reject(new Error('HTTP server close timeout'));
        }, 5000);
        
        server.close(() => {
          clearTimeout(timeout);
          console.log(`[Yjs Server] Instance ${instanceId} Step 4 completed: HTTP server closed`);
          resolve();
        });
      });
      
      console.log(`[Yjs Server] Instance ${instanceId} All shutdown steps completed successfully`);
      
    } catch (error) {
      console.error(`[Yjs Server] Instance ${instanceId} Error during graceful shutdown:`, error);
      console.log(`[Yjs Server] Instance ${instanceId} Forcing exit due to shutdown error`);
      process.exit(1);
    }
    
    console.log(`[Yjs Server] Instance ${instanceId} Graceful shutdown completed, exiting...`);
    process.exit(0);
  };

  // Add timeout for graceful shutdown
  let shutdownInProgress = false;
  const forceShutdown = () => {
    if (shutdownInProgress) {
      console.error(`[Yjs Server] Instance ${instanceId} Forceful shutdown: Graceful shutdown took too long`);
      process.exit(1);
    }
  };

  const handleShutdown = async () => {
    if (shutdownInProgress) {
      console.log(`[Yjs Server] Instance ${instanceId} Shutdown already in progress, ignoring additional signal`);
      return;
    }
    shutdownInProgress = true;
    
    // Set a timeout for forced shutdown
    const forceTimeout = setTimeout(forceShutdown, 10000); // 10 seconds
    console.log(`[Yjs Server] Instance ${instanceId} Force shutdown timeout set to 10 seconds`);
    
    try {
      await gracefulShutdown();
      clearTimeout(forceTimeout);
    } catch (error) {
      clearTimeout(forceTimeout);
      console.error(`[Yjs Server] Instance ${instanceId} Graceful shutdown failed:`, error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
  
  // Handle uncaught exceptions to prevent hanging
  process.on('uncaughtException', (err) => {
    console.error(`[Yjs Server] Instance ${instanceId} Uncaught exception:`, err);
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error(`[Yjs Server] Instance ${instanceId} Unhandled rejection at:`, promise, 'reason:', reason);
    process.exit(1);
  });
}

start()
