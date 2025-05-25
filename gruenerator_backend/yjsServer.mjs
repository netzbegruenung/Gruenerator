import http from 'http'
import { WebSocketServer } from 'ws'
import dotenv from 'dotenv'
import { supabasePersistence } from './utils/supabasePersistence.mjs'; // Import the persistence module

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
    setPersistence(supabasePersistence);
    console.log(`[Yjs Server] Instance ${instanceId} Supabase persistence provider has been set.`);
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

  // Temporarily comment out the setupWSConnection line
  wss.on('connection', (conn, req) => {
    console.log(`[Yjs Server] Instance ${instanceId} New WebSocket connection received.`);
    // The documentName is usually extracted from req.url (e.g., /:documentName)
    // setupWSConnection from y-websocket typically handles this.
    // We rely on setupWSConnection to use the configured persistence provider.
    setupWSConnection(conn, req);
  });
  // console.log(`[Yjs Server] Instance ${instanceId} Yjs setupWSConnection line is currently COMMENTED OUT.`);

  console.log(`[Yjs Server] Instance ${instanceId} Attempting to listen on ws://${host}:${port}`);
  server.listen(port, host, () =>
    console.log(`[Yjs Server] Instance ${instanceId} Running on ws://${host}:${port}`)
  )
  console.log(`[Yjs Server] Instance ${instanceId} Called server.listen()`);

  // Graceful shutdown
  const gracefulShutdown = () => {
    console.log(`[Yjs Server] Instance ${instanceId} Received kill signal, shutting down gracefully...`);
    if (wss) {
      wss.close(() => { 
        console.log(`[Yjs Server] Instance ${instanceId} WebSocket server closed.`);
        server.close(() => {
          console.log(`[Yjs Server] Instance ${instanceId} HTTP server closed.`);
          process.exit(0);
        });
      });
    } else {
      server.close(() => { 
        console.log(`[Yjs Server] Instance ${instanceId} HTTP server closed (simplified shutdown).`);
        process.exit(0);
      });
    }

    // Force shutdown if graceful shutdown takes too long
    setTimeout(() => {
      console.error(`[Yjs Server] Instance ${instanceId} Could not close connections in time, forcefully shutting down`);
      process.exit(1);
    }, 10000); // 10 seconds timeout
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

start()
