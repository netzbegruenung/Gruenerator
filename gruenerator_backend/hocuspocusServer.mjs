import dotenv from 'dotenv';
import { Server } from '@hocuspocus/server';
import { Logger } from '@hocuspocus/extension-logger';

dotenv.config();

const host = process.env.HOCUSPOCUS_HOST || '0.0.0.0';
const port = Number(process.env.HOCUSPOCUS_PORT || 1240);

// Add an instance ID for logging
const instanceId = Math.random().toString(36).substring(2, 9);
console.log(`[Hocuspocus] Instance ${instanceId} starting...`);

// Track active connections and documents
let activeConnections = 0;
const activeDocuments = new Set();

const server = new Server({
  port,
  address: host,
  extensions: [
    new Logger(),
  ],
  
  async onConnect(data) {
    activeConnections++;
    activeDocuments.add(data.documentName);
    console.log(`[Hocuspocus] Client connected to document: ${data.documentName}. Active: ${activeConnections}`);
  },
  
  async onDisconnect(data) {
    activeConnections--;
    console.log(`[Hocuspocus] Client disconnected from document: ${data.documentName}. Active: ${activeConnections}`);
  },
  
  async onLoadDocument(data) {
    console.log(`[Hocuspocus] Document loaded: ${data.documentName}`);
  },
  
  async onAuthenticate(data) {
    // For now, allow all connections
    console.log(`[Hocuspocus] Authentication request for document: ${data.documentName}`);
    return {};
  },

  async onListen(data) {
    console.log(`[Hocuspocus] Instance ${instanceId} running at ws://${host}:${data.port}`);
  },
});

// Start server
server.listen();

// Enhanced graceful shutdown
const shutdown = async (signal) => {
  try {
    console.log(`[Hocuspocus] Instance ${instanceId} received ${signal}. Shutting down gracefully...`);
    console.log(`[Hocuspocus] Active connections: ${activeConnections}, Active documents: ${activeDocuments.size}`);
    
    await server.destroy();
    console.log(`[Hocuspocus] Instance ${instanceId} shutdown complete.`);
    process.exit(0);
  } catch (err) {
    console.error(`[Hocuspocus] Instance ${instanceId} error during shutdown:`, err);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error(`[Hocuspocus] Instance ${instanceId} uncaught exception:`, err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[Hocuspocus] Instance ${instanceId} unhandled rejection at:`, promise, 'reason:', reason);
  process.exit(1);
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
