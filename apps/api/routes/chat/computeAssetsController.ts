/**
 * Serves run_python compute assets (figures/exports) stored by the resume
 * endpoint. Session-authenticated and userId-scoped: the path is derived from
 * the SESSION user, so one user can never address another user's assets, and
 * the file-name allowlist in resolveComputeAssetPath blocks traversal.
 */
import { existsSync } from 'node:fs';

import express, { type Request, type Response } from 'express';

import { resolveComputeAssetPath } from './services/computeAssetStorage.js';
import { getUser } from './services/threadPersistenceService.js';

const router = express.Router();

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  png: 'image/png',
  csv: 'text/csv',
  json: 'application/json',
  txt: 'text/plain',
  md: 'text/markdown',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
};

router.get('/:fileName', (req: Request, res: Response): void => {
  const user = getUser(req);
  if (!user?.id) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const rawParam = req.params.fileName;
  const fileName = typeof rawParam === 'string' ? rawParam : '';
  const filePath = resolveComputeAssetPath(user.id, fileName);
  if (!filePath || !existsSync(filePath)) {
    res.status(404).json({ error: 'Nicht gefunden' });
    return;
  }

  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  res.setHeader('Content-Type', CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream');
  // Assets are immutable (uuid names) — cache privately for a day.
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(filePath);
});

export default router;
