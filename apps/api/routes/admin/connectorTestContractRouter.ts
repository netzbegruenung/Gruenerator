/**
 * ts-rest-Router der Konnektor-Testseite (Admin): Google und Microsoft über
 * Nango verbinden, Token prüfen und eine Datei lesen, bevor die Konnektoren für
 * alle freigeschaltet werden.
 *
 * `requireAuth` sitzt am Präfix `/api/auth/admin/connector-test` (routes.ts);
 * die Rolle prüft jeder Handler selbst. Alles läuft mit der Kennung der
 * angemeldeten Admin-Person — die Seite testet deren eigene Verbindung, nie die
 * einer anderen.
 *
 * `read` geht absichtlich durch `retrieveConnectFile`, denselben Abruf, den
 * `@connect` im Chat fährt: ein grünes Ergebnis hier heisst, der Chat liest die
 * Datei genauso.
 */
import { connectorTestContract, type ConnectorTestFile } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import axios from 'axios';

import { retrieveConnectFile } from '../../agents/langgraph/ChatGraph/nodes/connectRetrieval.js';
import { env } from '../../config/env.js';
import * as googleDriveClient from '../../services/api-clients/googleDriveClient.js';
import * as microsoftGraphClient from '../../services/api-clients/microsoftGraphClient.js';
import { ConnectionService } from '../../services/connections/ConnectionService.js';
import { requireInstanceAdmin } from '../../utils/adminAuthz.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application, Request } from 'express';

const log = createLogger('connectorTestContractRouter');

const FORBIDDEN = {
  status: 403 as const,
  body: { success: false as const, message: 'Keine Admin-Berechtigung.' },
};

const PROVIDERS = ['google', 'microsoft'] as const;

/** Im Chat teilt `fairShare` die Chunks auf; hier zählt die ganze Datei. */
const READ_CHUNK_LIMIT = 50;
const PREVIEW_CHARS = 3000;

const GOOGLE_FOLDER_MIME = 'application/vnd.google-apps.folder';

const s = initServer();

async function adminId(req: Request): Promise<string | null> {
  const user = getAuthedUser(req);
  return (await requireInstanceAdmin(user.id, user.email)) ? user.id : null;
}

/** HTTP-Status und Antwort des Anbieters statt nur „Request failed with status 403". */
function describeError(err: unknown): string {
  if (axios.isAxiosError(err) && err.response) {
    const data = JSON.stringify(err.response.data ?? null).slice(0, 500);
    return `HTTP ${err.response.status}: ${data}`;
  }
  return err instanceof Error ? err.message : String(err);
}

function serverError(message: string) {
  return { status: 500 as const, body: { success: false as const, message } };
}

export const connectorTestContractRouter = s.router(connectorTestContract, {
  status: async ({ req }) => {
    const userId = await adminId(req);
    if (!userId) return FORBIDDEN;
    try {
      const all = await ConnectionService.listConnections(userId, { includeHidden: true });
      return {
        status: 200 as const,
        body: {
          success: true as const,
          nangoConfigured: Boolean(env.NANGO_SECRET_KEY),
          pickerConfigured: Boolean(env.GOOGLE_PICKER_API_KEY && env.GOOGLE_PICKER_APP_ID),
          providers: PROVIDERS.map((provider) => {
            const p = all.find((c) => c.provider === provider);
            return {
              provider,
              label: p?.label ?? provider,
              connected: p?.connected ?? false,
              connectedAt: p?.connectedAt ?? null,
            };
          }),
        },
      };
    } catch (err) {
      log.error('[connectorTest.status] failed', err);
      return serverError(describeError(err));
    }
  },

  connect: async ({ req, params }) => {
    const userId = await adminId(req);
    if (!userId) return FORBIDDEN;
    try {
      const connectLink = await ConnectionService.createConnectLink(userId, params.provider);
      return { status: 200 as const, body: { success: true as const, connectLink } };
    } catch (err) {
      log.error(`[connectorTest.connect] ${params.provider} failed`, err);
      return serverError(`Nango-Session fehlgeschlagen: ${describeError(err)}`);
    }
  },

  probe: async ({ req, params, body }) => {
    const userId = await adminId(req);
    if (!userId) return FORBIDDEN;
    const folderId = body.folderId ?? undefined;
    try {
      const { accessToken } = await ConnectionService.getConnection(userId, params.provider);
      let files: ConnectorTestFile[];
      if (params.provider === 'google') {
        const result = await googleDriveClient.listFiles(accessToken, folderId);
        files = result.files.map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          isFolder: f.mimeType === GOOGLE_FOLDER_MIME,
        }));
      } else {
        const result = await microsoftGraphClient.listDriveItems(accessToken, folderId);
        files = result.items.map((item) => ({
          id: item.id,
          name: item.name,
          mimeType: item.file?.mimeType ?? null,
          isFolder: Boolean(item.folder),
        }));
      }
      return {
        status: 200 as const,
        body: { success: true as const, ok: true, error: null, files },
      };
    } catch (err) {
      log.warn(`[connectorTest.probe] ${params.provider} failed`, err);
      return {
        status: 200 as const,
        body: { success: true as const, ok: false, error: describeError(err), files: [] },
      };
    }
  },

  picker: async ({ req }) => {
    const userId = await adminId(req);
    if (!userId) return FORBIDDEN;
    const apiKey = env.GOOGLE_PICKER_API_KEY;
    const appId = env.GOOGLE_PICKER_APP_ID;
    if (!apiKey || !appId) {
      return {
        status: 404 as const,
        body: {
          success: false as const,
          message: 'GOOGLE_PICKER_API_KEY oder GOOGLE_PICKER_APP_ID ist nicht gesetzt.',
        },
      };
    }
    try {
      const { accessToken } = await ConnectionService.getConnection(userId, 'google');
      return {
        status: 200 as const,
        body: { success: true as const, accessToken, apiKey, appId },
      };
    } catch (err) {
      log.warn('[connectorTest.picker] token lookup failed', err);
      return serverError(`Google-Token nicht abrufbar: ${describeError(err)}`);
    }
  },

  read: async ({ req, params, body }) => {
    const userId = await adminId(req);
    if (!userId) return FORBIDDEN;
    try {
      const result = await retrieveConnectFile(
        {
          kind: 'connect',
          id: `connector-test:${params.provider}:${body.fileId}`,
          label: body.name,
          connect: {
            provider: params.provider,
            fileId: body.fileId,
            name: body.name,
            mimeType: body.mimeType ?? null,
          },
        },
        READ_CHUNK_LIMIT,
        userId
      );
      const firstChunk = result.results[0]?.content ?? '';
      return {
        status: 200 as const,
        body: {
          success: true as const,
          ok: !result.error && result.results.length > 0,
          error: result.error?.message ?? null,
          reauth: result.error?.reauth ?? false,
          chunkCount: result.results.length,
          preview: firstChunk.slice(0, PREVIEW_CHARS),
        },
      };
    } catch (err) {
      log.error(`[connectorTest.read] ${params.provider} failed`, err);
      return serverError(describeError(err));
    }
  },

  disconnect: async ({ req, params }) => {
    const userId = await adminId(req);
    if (!userId) return FORBIDDEN;
    try {
      await ConnectionService.deleteConnection(userId, params.provider);
      return { status: 200 as const, body: { success: true as const } };
    } catch (err) {
      log.error(`[connectorTest.disconnect] ${params.provider} failed`, err);
      return serverError(describeError(err));
    }
  },
});

export function mountConnectorTestContractRouter(app: Application): void {
  createExpressEndpoints(connectorTestContract, connectorTestContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'connectorTestContract'),
  });
}
