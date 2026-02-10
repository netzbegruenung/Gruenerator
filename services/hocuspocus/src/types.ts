import type { AuthService } from './auth.js';
import type { PostgresPersistence } from './persistence.js';

export type DbQueryFn = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export interface RedisLike {
  isReady: boolean;
  get(key: string): Promise<string | null>;
}

export interface AuthConfig {
  db: DbQueryFn;
  redis: RedisLike;
  sessionSecret: string;
}

export interface AuthenticationData {
  documentName: string;
  requestHeaders: Record<string, string | string[] | undefined>;
  requestParameters: URLSearchParams;
  connection: unknown;
  token?: string;
}

export interface AuthenticationResult {
  authenticated: boolean;
  userId?: string;
  userName?: string;
  readOnly?: boolean;
  reason?: string;
}

export interface HocuspocusConfig {
  port: number;
  host: string;
  persistence: PostgresPersistence;
  auth: AuthService;
}
