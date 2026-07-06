/**
 * ts-rest router for /api/mcp/servers (EXPERIMENTAL).
 *
 * Per-user CRUD for external MCP servers plus a connection `test`. requireAuth
 * is applied at the prefix in routes.ts; every handler is user-scoped via
 * getAuthedUser.
 */

import { mcpServersContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { McpRegistryService } from '../../services/mcp/McpRegistryService.js';
import { McpServerRegistry } from '../../services/mcp/McpServerRegistry.js';
import { UserMCPClient } from '../../services/mcp/UserMCPClient.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('mcpServersContract');

const s = initServer();

export const mcpServersContractRouter = s.router(mcpServersContract, {
  list: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const servers = await McpServerRegistry.list(userId);
      return { status: 200 as const, body: { servers } };
    } catch (error) {
      log.error('list failed', error);
      return { status: 500 as const, body: { error: (error as Error).message || 'Fehler' } };
    }
  },

  registry: async (args) => {
    try {
      const page = McpRegistryService.list({
        ...(args.query.search !== undefined && { search: args.query.search }),
        ...(args.query.cursor !== undefined && { cursor: args.query.cursor }),
      });
      return { status: 200 as const, body: page };
    } catch (error) {
      log.error('registry failed', error);
      return { status: 500 as const, body: { error: (error as Error).message || 'Fehler' } };
    }
  },

  create: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const server = await McpServerRegistry.create(userId, {
        name: args.body.name,
        url: args.body.url,
        authType: args.body.authType,
        token: args.body.token ?? null,
      });
      return { status: 201 as const, body: { server } };
    } catch (error) {
      const message = (error as Error).message || 'Fehler';
      if (/unique|duplicate/i.test(message)) {
        return {
          status: 409 as const,
          body: { error: 'Ein Server mit diesem Namen existiert bereits.' },
        };
      }
      log.error('create failed', error);
      return { status: 500 as const, body: { error: message } };
    }
  },

  update: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const server = await McpServerRegistry.update(userId, args.params.id, {
        ...(args.body.name !== undefined && { name: args.body.name }),
        ...(args.body.url !== undefined && { url: args.body.url }),
        ...(args.body.authType !== undefined && { authType: args.body.authType }),
        ...(args.body.token !== undefined && { token: args.body.token }),
        ...(args.body.enabled !== undefined && { enabled: args.body.enabled }),
      });
      if (!server) return { status: 404 as const, body: { error: 'Server nicht gefunden.' } };
      return { status: 200 as const, body: { server } };
    } catch (error) {
      log.error('update failed', error);
      return { status: 500 as const, body: { error: (error as Error).message || 'Fehler' } };
    }
  },

  remove: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const deleted = await McpServerRegistry.delete(userId, args.params.id);
      if (!deleted) return { status: 404 as const, body: { error: 'Server nicht gefunden.' } };
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('remove failed', error);
      return { status: 500 as const, body: { error: (error as Error).message || 'Fehler' } };
    }
  },

  test: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const configs = await McpServerRegistry.getConnectionConfigs(userId);
      const config = configs.find((c) => c.id === args.params.id);
      if (!config)
        return { status: 404 as const, body: { error: 'Server nicht gefunden oder deaktiviert.' } };

      const client = new UserMCPClient(config);
      try {
        await client.connect();
        const tools = await client.listTools();
        return {
          status: 200 as const,
          body: {
            ok: true,
            toolCount: tools.length,
            toolNames: tools.map((t) => t.name),
            error: null,
          },
        };
      } catch (err) {
        return {
          status: 200 as const,
          body: {
            ok: false,
            toolCount: 0,
            toolNames: [],
            error: err instanceof Error ? err.message : String(err),
          },
        };
      } finally {
        await client.close();
      }
    } catch (error) {
      log.error('test failed', error);
      return { status: 500 as const, body: { error: (error as Error).message || 'Fehler' } };
    }
  },
});

export function mountMcpServersContractRouter(app: Application): void {
  createExpressEndpoints(mcpServersContract, mcpServersContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'mcpServersContract'),
  });
}
