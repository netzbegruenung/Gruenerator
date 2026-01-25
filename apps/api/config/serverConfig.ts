/**
 * Server Configuration
 * Extracted from server.mjs for better modularity
 */

import type { ServerOptions as HttpServerOptions } from 'http';

export interface ServerConfig {
  port: number;
  host: string;
  httpOptions: HttpServerOptions;
  keepAliveTimeout: number;
  headersTimeout: number;
  socketKeepAliveInterval: number;
  requestTimeout: number;
  responseTimeout: number;
}

export interface ServerConfigOverrides {
  port?: number;
  host?: string;
}

const defaultConfig: ServerConfig = {
  port: 3001,
  host: '127.0.0.1',
  httpOptions: {
    // Note: enableHTTP2 and allowHTTP1 are custom properties for documentation
    // The actual HTTP/2 is handled at the proxy level
  },
  keepAliveTimeout: 60000,
  headersTimeout: 65000,
  socketKeepAliveInterval: 30000,
  requestTimeout: 300000, // 5 minutes
  responseTimeout: 900000, // 15 minutes
};

/**
 * Get server configuration with environment variable overrides
 */
export function getServerConfig(overrides?: ServerConfigOverrides): ServerConfig {
  return {
    ...defaultConfig,
    port: overrides?.port ?? parseInt(process.env.PORT || String(defaultConfig.port), 10),
    host: overrides?.host ?? process.env.HOST ?? defaultConfig.host,
  };
}

export default getServerConfig;
