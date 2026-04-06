import { getNango, NANGO_PROVIDERS, type NangoProviderKey } from '../../config/nango.js';

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
    const result = await getNango().listConnections({ connectionId: userId });

    return Object.entries(NANGO_PROVIDERS).map(([key, config]) => {
      const connection = result.connections.find(
        (c) => c.provider_config_key === key,
      );
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

  static async getConnection(
    userId: string,
    providerKey: NangoProviderKey,
  ): Promise<ConnectionDetail> {
    const connection = await getNango().getConnection(providerKey, userId);
    const credentials = connection.credentials as { access_token?: string };
    if (!credentials.access_token) {
      throw new Error(`No access token available for ${providerKey}`);
    }
    return {
      provider: providerKey,
      accessToken: credentials.access_token,
      connectionId: userId,
    };
  }

  static async deleteConnection(
    userId: string,
    providerKey: NangoProviderKey,
  ): Promise<void> {
    await getNango().deleteConnection(providerKey, userId);
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
