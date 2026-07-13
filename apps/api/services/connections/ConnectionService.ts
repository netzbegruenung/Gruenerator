import {
  getNango,
  HIDDEN_NANGO_PROVIDERS,
  NANGO_PROVIDERS,
  type NangoProviderKey,
} from '../../config/nango.js';
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

export class ConnectionService {
  static async listConnections(userId: string): Promise<ConnectionStatus[]> {
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

    return Object.entries(NANGO_PROVIDERS)
      .filter(([key]) => !HIDDEN_NANGO_PROVIDERS.has(key as NangoProviderKey))
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

  static async createSessionToken(userId: string): Promise<string> {
    const response = await getNango().createConnectSession({
      end_user: {
        id: userId,
      },
    });
    return response.data.token;
  }
}
