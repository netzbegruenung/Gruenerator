import { env } from '../../config/env.js';
import {
  ADMIN_ONLY_NANGO_PROVIDERS,
  getNango,
  HIDDEN_NANGO_PROVIDERS,
  NANGO_PROVIDERS,
  type NangoProviderKey,
} from '../../config/nango.js';
import { isInstanceAdmin } from '../../utils/adminAuthz.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('connections');

export interface ConnectionStatus {
  provider: NangoProviderKey;
  label: string;
  services: readonly string[];
  connected: boolean;
  connectionId: string | null;
  connectedAt: string | null;
}

export interface ConnectionDetail {
  provider: NangoProviderKey;
  accessToken: string;
  connectionId: string;
}

/** A non-admin asked for a provider in `ADMIN_ONLY_NANGO_PROVIDERS`. */
export class ConnectionNotAllowedError extends Error {
  constructor(readonly provider: NangoProviderKey) {
    super(`${NANGO_PROVIDERS[provider].label} ist nur für Admins freigeschaltet.`);
    this.name = 'ConnectionNotAllowedError';
  }
}

export class ConnectionService {
  /**
   * Providers this person may not touch. Empty for instance admins; asks the
   * database only when an admin-only provider exists at all.
   */
  private static async deniedProviders(userId: string): Promise<Set<NangoProviderKey>> {
    if (ADMIN_ONLY_NANGO_PROVIDERS.size === 0) return new Set();
    return (await isInstanceAdmin(userId)) ? new Set() : ADMIN_ONLY_NANGO_PROVIDERS;
  }

  static async listConnections(
    userId: string,
    { includeHidden = false }: { includeHidden?: boolean } = {}
  ): Promise<ConnectionStatus[]> {
    // Connections are created via createConnectSession with end_user.id = userId, so Nango
    // files them under that end-user id and assigns its own random connection_id. Filter by
    // userId (→ ?endUserId=), NOT connectionId (which never equals userId).
    // A Nango outage/misconfig must NOT break the whole connector panel — degrade to
    // "all disconnected" so MCP connectors still render alongside.
    let connections: Awaited<
      ReturnType<ReturnType<typeof getNango>['listConnections']>
    >['connections'] = [];
    try {
      ({ connections } = await getNango().listConnections({ userId }));
    } catch (error) {
      log.error('Nango listConnections failed — reporting all providers as disconnected', error);
    }

    const denied = await this.deniedProviders(userId);
    return Object.entries(NANGO_PROVIDERS)
      .filter(([key]) => includeHidden || !HIDDEN_NANGO_PROVIDERS.has(key as NangoProviderKey))
      .filter(([key]) => !denied.has(key as NangoProviderKey))
      .map(([key, config]) => {
        const connection = connections.find((c) => c.provider_config_key === key);
        return {
          provider: key as NangoProviderKey,
          label: config.label,
          services: config.services,
          connected: !!connection,
          connectionId: connection ? connection.connection_id : null,
          connectedAt: connection ? (connection.created ?? null) : null,
        };
      });
  }

  // getConnection/deleteConnection need Nango's real connection_id, not the end-user id —
  // resolve it from the end-user id first.
  private static async resolveConnectionId(
    userId: string,
    providerKey: NangoProviderKey
  ): Promise<string | null> {
    const result = await getNango().listConnections({ userId, integrationId: providerKey });
    const connection = result.connections.find((c) => c.provider_config_key === providerKey);
    return connection ? connection.connection_id : null;
  }

  static async getConnection(
    userId: string,
    providerKey: NangoProviderKey
  ): Promise<ConnectionDetail> {
    // Also blocks a connection a non-admin made before the provider became
    // admin-only; disconnecting it (`deleteConnection`) stays possible.
    if ((await this.deniedProviders(userId)).has(providerKey)) {
      throw new ConnectionNotAllowedError(providerKey);
    }
    const connectionId = await this.resolveConnectionId(userId, providerKey);
    if (!connectionId) {
      throw new Error(`No ${providerKey} connection found for user`);
    }
    const connection = await getNango().getConnection(providerKey, connectionId);
    const credentials = connection.credentials as { access_token?: string };
    if (!credentials.access_token) {
      throw new Error(`No access token available for ${providerKey}`);
    }
    return {
      provider: providerKey,
      accessToken: credentials.access_token,
      connectionId,
    };
  }

  static async deleteConnection(userId: string, providerKey: NangoProviderKey): Promise<void> {
    const connectionId = await this.resolveConnectionId(userId, providerKey);
    if (!connectionId) {
      return;
    }
    await getNango().deleteConnection(providerKey, connectionId);
  }

  /**
   * Account deletion: every connection of the user across all integrations,
   * hidden ones included. Unlike `listConnections` a Nango failure throws —
   * silently reporting "nothing connected" here would leave live tokens behind.
   */
  static async deleteAllConnections(userId: string): Promise<number> {
    const { connections } = await getNango().listConnections({ userId });
    const failed: unknown[] = [];
    for (const c of connections) {
      try {
        await getNango().deleteConnection(c.provider_config_key, c.connection_id);
      } catch (error) {
        failed.push(error);
      }
    }
    if (failed.length > 0) {
      throw new AggregateError(failed, `${failed.length} Nango connection(s) not deleted`);
    }
    return connections.length;
  }

  /**
   * Nango's connect UI offers every integration the session allows; without
   * `allowed_integrations` that is all of them, admin-only ones included.
   */
  static async createSessionToken(userId: string): Promise<string> {
    const denied = await this.deniedProviders(userId);
    const allowed = (Object.keys(NANGO_PROVIDERS) as NangoProviderKey[]).filter(
      (key) => !denied.has(key)
    );
    const response = await getNango().createConnectSession({
      end_user: {
        id: userId,
      },
      ...(denied.size > 0 && { allowed_integrations: allowed }),
    });
    return response.data.token;
  }

  /** Connect-Link für genau einen Anbieter — Nango zeigt dann keine Auswahl. */
  static async createConnectLink(userId: string, providerKey: NangoProviderKey): Promise<string> {
    if ((await this.deniedProviders(userId)).has(providerKey)) {
      throw new ConnectionNotAllowedError(providerKey);
    }
    const response = await getNango().createConnectSession({
      end_user: { id: userId },
      allowed_integrations: [providerKey],
    });
    const link = new URL(response.data.connect_link);
    if (env.NANGO_PUBLIC_URL) link.searchParams.set('apiURL', env.NANGO_PUBLIC_URL);
    return link.toString();
  }
}
