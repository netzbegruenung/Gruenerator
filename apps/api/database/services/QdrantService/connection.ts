/**
 * QdrantService Connection Management
 * Extracted connection functions for Qdrant vector database
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import * as http from 'http';
import * as https from 'https';
import { createLogger } from '../../../utils/logger.js';
import type { Logger } from 'winston';

const logger = createLogger('QdrantConnection');

// Type for the QdrantClient constructor options (agent is supported but not in types)
type QdrantClientOptions = ConstructorParameters<typeof QdrantClient>[0] & {
  agent?: http.Agent | https.Agent;
};

/**
 * Configuration interface for Qdrant client creation
 */
export interface QdrantClientConfig {
  url: string;
  apiKey: string;
  basicAuthUsername?: string;
  basicAuthPassword?: string;
  timeout?: number;
}

/**
 * Connection state interface for health checking
 */
export interface ConnectionState {
  isConnected: boolean;
  lastHealthCheck: number;
}

/**
 * Creates a configured QdrantClient with proper HTTP/HTTPS agent settings
 * @param config - Configuration options for the Qdrant client
 * @returns Configured QdrantClient instance
 */
export function createQdrantClient(config: QdrantClientConfig): QdrantClient {
  const { url, apiKey, basicAuthUsername, basicAuthPassword, timeout = 60000 } = config;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('QDRANT_API_KEY is required but not set or empty');
  }

  logger.debug(`Creating Qdrant client for ${url}`);

  // Configure HTTP agent for better connection handling
  const isHttps = url.startsWith('https');
  const AgentClass = isHttps ? https.Agent : http.Agent;
  const httpAgent = new AgentClass({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 10,
    maxFreeSockets: 5,
    timeout: 30000,
  });

  // Build headers for basic auth if provided
  const headers: Record<string, string> = {};
  if (basicAuthUsername && basicAuthPassword) {
    const basicAuth = Buffer.from(`${basicAuthUsername}:${basicAuthPassword}`).toString('base64');
    headers['Authorization'] = `Basic ${basicAuth}`;
  }

  // Use host/port approach for HTTPS support due to Qdrant client URL parsing bug
  if (url.startsWith('https://')) {
    const parsedUrl = new URL(url);
    const port = parsedUrl.port ? parseInt(parsedUrl.port) : 443;

    // Extract path as prefix if it exists (e.g., /qdrant/)
    const basePath =
      parsedUrl.pathname && parsedUrl.pathname !== '/' ? parsedUrl.pathname : undefined;

    const options: QdrantClientOptions = {
      host: parsedUrl.hostname,
      port: port,
      https: true,
      apiKey: apiKey,
      timeout: timeout,
      checkCompatibility: false,
      agent: httpAgent,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(basePath ? { prefix: basePath } : {}),
    };

    return new QdrantClient(options as ConstructorParameters<typeof QdrantClient>[0]);
  } else {
    const options: QdrantClientOptions = {
      url: url,
      apiKey: apiKey,
      https: false,
      timeout: timeout,
      agent: httpAgent,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    };

    return new QdrantClient(options as ConstructorParameters<typeof QdrantClient>[0]);
  }
}

/**
 * Tests connection to Qdrant by fetching collections
 * @param client - QdrantClient instance to test
 * @returns Promise resolving to true if connection succeeds
 * @throws Error if connection fails
 */
export async function testConnection(client: QdrantClient): Promise<boolean> {
  try {
    await client.getCollections();
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Qdrant connection failed: ${errorMessage}`);
  }
}

/**
 * Tests connection with retry logic and exponential backoff
 * @param client - QdrantClient instance to test
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param log - Optional logger instance (defaults to module logger)
 * @returns Promise resolving to true if connection succeeds
 * @throws Error if all retry attempts fail
 */
export async function testConnectionWithRetry(
  client: QdrantClient,
  maxRetries: number = 3,
  log: Logger = logger
): Promise<boolean> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await client.getCollections();
      log.debug(`Connection test successful (attempt ${attempt})`);
      return true;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      log.debug(`Connection attempt ${attempt}/${maxRetries} failed: ${lastError.message}`);

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Qdrant connection failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Result of a health check operation
 */
export interface HealthCheckResult {
  healthy: boolean;
  needsReconnect: boolean;
  sslError: boolean;
  lastHealthCheck: number;
}

/**
 * Checks connection health and determines if reconnection is needed
 * @param client - QdrantClient instance to check
 * @param isConnected - Current connection state
 * @param lastHealthCheck - Timestamp of last health check
 * @param healthCheckInterval - Minimum interval between health checks in milliseconds (default: 30000)
 * @param log - Optional logger instance (defaults to module logger)
 * @returns Promise resolving to health check result
 */
export async function checkConnectionHealth(
  client: QdrantClient | null,
  isConnected: boolean,
  lastHealthCheck: number,
  healthCheckInterval: number = 30000,
  log: Logger = logger
): Promise<HealthCheckResult> {
  const now = Date.now();

  // Skip health check if recently performed
  if (now - lastHealthCheck < healthCheckInterval) {
    return {
      healthy: isConnected,
      needsReconnect: false,
      sslError: false,
      lastHealthCheck: lastHealthCheck,
    };
  }

  // If not connected, needs reconnection
  if (!isConnected || !client) {
    log.debug('Connection lost, reconnection needed');
    return {
      healthy: false,
      needsReconnect: true,
      sslError: false,
      lastHealthCheck: now,
    };
  }

  try {
    await client.getCollections();
    return {
      healthy: true,
      needsReconnect: false,
      sslError: false,
      lastHealthCheck: now,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.debug(`Health check failed: ${errorMessage}`);

    // Check for SSL-specific errors that require full reconnection
    const isSslError = errorMessage.includes('SSL') || errorMessage.includes('wrong version');

    if (isSslError) {
      log.debug('SSL error detected, forcing full reconnection');
    }

    return {
      healthy: false,
      needsReconnect: true,
      sslError: isSslError,
      lastHealthCheck: now,
    };
  }
}
