/**
 * ts-rest contract for /api/mcp/servers (EXPERIMENTAL).
 *
 * Per-user registry of external MCP servers. Covers the surface of
 * apps/api/routes/mcp/mcpServersContractRouter.ts.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  mcpServerCreateBodySchema,
  mcpServerUpdateBodySchema,
  mcpServerListResponseSchema,
  mcpServerResponseSchema,
  mcpServerDeleteResponseSchema,
  mcpServerTestResponseSchema,
  mcpServerErrorResponseSchema,
  mcpRegistryResponseSchema,
  mcpOauthStartResponseSchema,
} from '../schemas/mcpServers.js';

const c = initContract();

export const mcpServersContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/api/mcp/servers',
      responses: {
        200: mcpServerListResponseSchema,
        500: mcpServerErrorResponseSchema,
      },
      summary: 'List the current user MCP servers',
    },

    registry: {
      method: 'GET',
      path: '/api/mcp/servers/registry',
      query: z.object({
        search: z.string().optional(),
        cursor: z.string().optional(),
      }),
      responses: {
        200: mcpRegistryResponseSchema,
        500: mcpServerErrorResponseSchema,
      },
      summary: 'Browse the official MCP registry (remote servers) + recommended',
    },

    create: {
      method: 'POST',
      path: '/api/mcp/servers',
      body: mcpServerCreateBodySchema,
      responses: {
        201: mcpServerResponseSchema,
        400: mcpServerErrorResponseSchema,
        409: mcpServerErrorResponseSchema,
        500: mcpServerErrorResponseSchema,
      },
      summary: 'Add an MCP server',
    },

    update: {
      method: 'PATCH',
      path: '/api/mcp/servers/:id',
      pathParams: z.object({ id: z.string() }),
      body: mcpServerUpdateBodySchema,
      responses: {
        200: mcpServerResponseSchema,
        400: mcpServerErrorResponseSchema,
        404: mcpServerErrorResponseSchema,
        500: mcpServerErrorResponseSchema,
      },
      summary: 'Update an MCP server',
    },

    remove: {
      method: 'DELETE',
      path: '/api/mcp/servers/:id',
      pathParams: z.object({ id: z.string() }),
      body: c.noBody(),
      responses: {
        200: mcpServerDeleteResponseSchema,
        404: mcpServerErrorResponseSchema,
        500: mcpServerErrorResponseSchema,
      },
      summary: 'Remove an MCP server',
    },

    test: {
      method: 'POST',
      path: '/api/mcp/servers/:id/test',
      pathParams: z.object({ id: z.string() }),
      body: c.noBody(),
      responses: {
        200: mcpServerTestResponseSchema,
        404: mcpServerErrorResponseSchema,
        500: mcpServerErrorResponseSchema,
      },
      summary: 'Test connect + list tools for an MCP server',
    },

    oauthStart: {
      method: 'POST',
      path: '/api/mcp/servers/:id/oauth/start',
      pathParams: z.object({ id: z.string() }),
      body: c.noBody(),
      responses: {
        200: mcpOauthStartResponseSchema,
        400: mcpServerErrorResponseSchema,
        404: mcpServerErrorResponseSchema,
        500: mcpServerErrorResponseSchema,
      },
      summary: 'Begin OAuth for an MCP server (returns the provider authorize URL)',
    },
  },
  { pathPrefix: '' }
);
