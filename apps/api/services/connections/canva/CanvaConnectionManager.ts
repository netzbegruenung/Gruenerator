/**
 * Per-user Canva connection store.
 *
 * One Canva connection per user, persisted as the `canva_connection` JSONB
 * column on `profiles`. Tokens are encrypted at rest with the shared credential
 * encryption helper.
 */

import { env } from '../../../config/env.js';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { createLogger } from '../../../utils/logger.js';
import { decryptCredential, encryptCredential } from '../../../utils/validation/encryption.js';
import { refreshTokens, type CanvaTokenResponse } from '../../api-clients/canvaClient.js';

const log = createLogger('canva-connection');

// Refresh a little before actual expiry to avoid racing the deadline mid-request.
const EXPIRY_SKEW_MS = 60_000;

interface CanvaConnectionRecord {
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  expires_at: string; // ISO timestamp
  scope: string | null;
  display_name: string | null;
  connected_at: string; // ISO timestamp
}

export interface CanvaConnectionStatus {
  connected: boolean;
  displayName: string | null;
  connectedAt: string | null;
}

export interface CanvaCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Read the integration's client credentials from the environment.
 * Throws (HTTP 503-ish) when the integration is not configured on this server.
 */
export function getCanvaCredentials(): CanvaCredentials {
  const clientId = env.CANVA_CLIENT_ID;
  const clientSecret = env.CANVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error('Canva-Integration ist auf diesem Server nicht konfiguriert'), {
      statusCode: 503,
    });
  }
  return { clientId, clientSecret };
}

export function getCanvaRedirectUri(): string {
  const redirectUri = env.CANVA_REDIRECT_URI;
  if (!redirectUri) {
    throw Object.assign(new Error('CANVA_REDIRECT_URI ist nicht konfiguriert'), {
      statusCode: 503,
    });
  }
  return redirectUri;
}

export class CanvaConnectionManager {
  private static async getPostgres() {
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    return postgres;
  }

  private static async getRecord(userId: string): Promise<CanvaConnectionRecord | null> {
    const postgres = await this.getPostgres();
    const profile = await postgres.queryOne<{ canva_connection: CanvaConnectionRecord | null }>(
      'SELECT canva_connection FROM profiles WHERE id = $1',
      [userId],
      { table: 'profiles' }
    );
    return profile?.canva_connection ?? null;
  }

  private static async writeRecord(
    userId: string,
    record: CanvaConnectionRecord | null
  ): Promise<void> {
    const postgres = await this.getPostgres();
    const result = await postgres.update(
      'profiles',
      { canva_connection: record ? JSON.stringify(record) : null },
      { id: userId }
    );
    if (!result.data || result.data.length === 0) {
      throw new Error('Profile not found');
    }
  }

  private static toRecord(
    tokens: CanvaTokenResponse,
    displayName: string | null,
    connectedAt: string
  ): CanvaConnectionRecord {
    return {
      access_token_encrypted: encryptCredential(tokens.access_token),
      refresh_token_encrypted: encryptCredential(tokens.refresh_token),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope ?? null,
      display_name: displayName,
      connected_at: connectedAt,
    };
  }

  /** Persist a freshly authorized connection. */
  static async save(
    userId: string,
    tokens: CanvaTokenResponse,
    displayName: string | null
  ): Promise<void> {
    await this.writeRecord(userId, this.toRecord(tokens, displayName, new Date().toISOString()));
    log.info('Canva connection saved', { userId });
  }

  static async getStatus(userId: string): Promise<CanvaConnectionStatus> {
    const record = await this.getRecord(userId);
    if (!record) {
      return { connected: false, displayName: null, connectedAt: null };
    }
    return {
      connected: true,
      displayName: record.display_name,
      connectedAt: record.connected_at,
    };
  }

  static async disconnect(userId: string): Promise<void> {
    const record = await this.getRecord(userId);
    if (!record) return;
    await this.writeRecord(userId, null);
    log.info('Canva connection removed', { userId });
  }

  /**
   * Return a currently-valid access token, transparently refreshing (and
   * persisting the rotated refresh token) when the stored one is near expiry.
   * Throws if the user has no connection.
   */
  static async getValidAccessToken(userId: string): Promise<string> {
    const record = await this.getRecord(userId);
    if (!record) {
      throw Object.assign(new Error('Keine Canva-Verbindung vorhanden'), { statusCode: 404 });
    }

    const expiresAt = new Date(record.expires_at).getTime();
    if (Date.now() < expiresAt - EXPIRY_SKEW_MS) {
      return decryptCredential(record.access_token_encrypted);
    }

    // Token expired/expiring — refresh using the rotated refresh token.
    const creds = getCanvaCredentials();
    const refreshToken = decryptCredential(record.refresh_token_encrypted);
    const tokens = await refreshTokens(creds, refreshToken);
    await this.writeRecord(userId, this.toRecord(tokens, record.display_name, record.connected_at));
    return tokens.access_token;
  }
}

export default CanvaConnectionManager;
