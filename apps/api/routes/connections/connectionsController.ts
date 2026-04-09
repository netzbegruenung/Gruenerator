import { Router, type Response } from 'express';

import { NANGO_PROVIDERS, type NangoProviderKey } from '../../config/nango.js';
import * as atlassianClient from '../../services/api-clients/atlassianClient.js';
import * as googleDriveClient from '../../services/api-clients/googleDriveClient.js';
import * as microsoftGraphClient from '../../services/api-clients/microsoftGraphClient.js';
import { ConnectionService } from '../../services/connections/ConnectionService.js';
import { createLogger } from '../../utils/logger.js';
import { getParam } from '../../utils/params.js';

import type { AuthRequest } from '../auth/types.js';

const log = createLogger('connections');
const router = Router();

function isValidProvider(key: string): key is NangoProviderKey {
  return key in NANGO_PROVIDERS;
}

router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Nicht authentifiziert' });

    const providers = await ConnectionService.listConnections(userId);
    res.json({ providers });
  } catch (error: unknown) {
    log.error('Failed to get connection status', error);
    res.status(500).json({ error: 'Status konnte nicht abgerufen werden' });
  }
});

router.post('/session-token', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Nicht authentifiziert' });

    const token = await ConnectionService.createSessionToken(userId);
    res.json({ token });
  } catch (error: unknown) {
    log.error('Failed to create session token', error);
    res.status(500).json({ error: 'Session-Token konnte nicht erstellt werden' });
  }
});

router.delete('/:providerKey', async (req: AuthRequest<{ providerKey: string }>, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Nicht authentifiziert' });

    const providerKey = getParam(req.params, 'providerKey');
    if (!isValidProvider(providerKey)) {
      return res.status(400).json({ error: `Unbekannter Provider: ${providerKey}` });
    }

    await ConnectionService.deleteConnection(userId, providerKey);
    log.info(`User ${userId} disconnected ${providerKey}`);
    res.json({ success: true, message: `${NANGO_PROVIDERS[providerKey].label} getrennt` });
  } catch (error: unknown) {
    log.error('Failed to delete connection', error);
    res.status(500).json({ error: 'Verbindung konnte nicht getrennt werden' });
  }
});

router.get(
  '/:providerKey/files',
  async (req: AuthRequest<{ providerKey: string }>, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Nicht authentifiziert' });

      const providerKey = getParam(req.params, 'providerKey');
      if (!isValidProvider(providerKey)) {
        return res.status(400).json({ error: `Unbekannter Provider: ${providerKey}` });
      }

      const connection = await ConnectionService.getConnection(userId, providerKey);
      const folderId = typeof req.query.folderId === 'string' ? req.query.folderId : undefined;

      switch (providerKey) {
        case 'google': {
          const result = await googleDriveClient.listFiles(connection.accessToken, folderId);
          return res.json(result);
        }
        case 'microsoft': {
          const result = await microsoftGraphClient.listDriveItems(
            connection.accessToken,
            folderId
          );
          return res.json(result);
        }
        case 'jira': {
          const sites = await atlassianClient.getAccessibleResources(connection.accessToken);
          if (sites.length === 0) return res.json({ projects: [] });
          const projects = await atlassianClient.listJiraProjects(
            connection.accessToken,
            sites[0].id
          );
          return res.json({ projects, cloudId: sites[0].id });
        }
        case 'confluence': {
          const sites = await atlassianClient.getAccessibleResources(connection.accessToken);
          if (sites.length === 0) return res.json({ spaces: [] });
          const spaces = await atlassianClient.listConfluenceSpaces(
            connection.accessToken,
            sites[0].id
          );
          return res.json({ spaces, cloudId: sites[0].id });
        }
        default:
          return res
            .status(400)
            .json({ error: `Dateizugriff für ${providerKey} nicht unterstützt` });
      }
    } catch (error: unknown) {
      log.error('Failed to list files', error);
      if (
        error instanceof Error &&
        'response' in error &&
        (error as { response?: { status?: number } }).response?.status === 401
      ) {
        return res.status(401).json({ error: 'Token abgelaufen — bitte erneut verbinden' });
      }
      res.status(500).json({ error: 'Dateien konnten nicht geladen werden' });
    }
  }
);

router.get(
  '/:providerKey/files/:fileId',
  async (req: AuthRequest<{ providerKey: string; fileId: string }>, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Nicht authentifiziert' });

      const providerKey = getParam(req.params, 'providerKey');
      const fileId = getParam(req.params, 'fileId');

      if (!isValidProvider(providerKey)) {
        return res.status(400).json({ error: `Unbekannter Provider: ${providerKey}` });
      }

      const connection = await ConnectionService.getConnection(userId, providerKey);

      switch (providerKey) {
        case 'google': {
          const file = await googleDriveClient.getFile(connection.accessToken, fileId);
          return res.json(file);
        }
        case 'microsoft': {
          const item = await microsoftGraphClient.getDriveItem(connection.accessToken, fileId);
          return res.json(item);
        }
        case 'jira':
        case 'confluence':
        default:
          return res
            .status(400)
            .json({ error: `Dateizugriff für ${providerKey} nicht unterstützt` });
      }
    } catch (error: unknown) {
      log.error('Failed to get file', error);
      res.status(500).json({ error: 'Datei konnte nicht geladen werden' });
    }
  }
);

export default router;
