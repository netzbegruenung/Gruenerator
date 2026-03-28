/**
 * Test controller for exploring Grüne API endpoints
 * Proxies calls to app.gruene.de using configured API key
 */

import axios from 'axios';
import { Router, type Request, type Response } from 'express';

import { createLogger } from '../../utils/logger.js';

const log = createLogger('GrueneApiTest');
const router = Router();

const API_BASE = process.env.GRUENE_API_BASEURL || 'https://app.gruene.de';
const API_KEY = process.env.GRUENE_API_KEY;

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
  },
});

async function proxyGet(path: string, params?: Record<string, string>) {
  try {
    const res = await apiClient.get(path, { params });
    return { status: res.status, data: res.data };
  } catch (error: any) {
    return {
      status: error.response?.status || 500,
      data: error.response?.data || { error: error.message },
    };
  }
}

/**
 * GET /api/internal/gruene-api/test
 * Calls multiple Grüne API endpoints and returns all results
 */
router.get('/test', async (_req: Request, res: Response) => {
  if (!API_KEY) {
    res.json({ error: 'GRUENE_API_KEY not configured' });
    return;
  }

  log.info('Running Grüne API test suite');

  const results: Record<string, any> = {};

  // Test all interesting endpoints
  const endpoints = [
    { key: 'divisions_BV', path: '/v1/divisions', params: { level: 'BV', limit: '5' } },
    { key: 'divisions_LV', path: '/v1/divisions', params: { level: 'LV', limit: '20' } },
    { key: 'divisions_KV_sample', path: '/v1/divisions', params: { level: 'KV', limit: '5' } },
    { key: 'divisions_OV_sample', path: '/v1/divisions', params: { level: 'OV', limit: '5' } },
    {
      key: 'divisions_search_koeln',
      path: '/v1/divisions',
      params: { search: 'köln', limit: '5' },
    },
    { key: 'organizations', path: '/v1/party/organizations' },
    { key: 'regionalchapters_sample', path: '/v1/party/regionalchapters', params: { limit: '5' } },
    { key: 'groups_sample', path: '/v1/party/groups' },
    { key: 'roles_sample', path: '/v1/roles', params: { limit: '5' } },
    { key: 'role_categories', path: '/v1/role-categories', params: { limit: '20' } },
    { key: 'role_tags', path: '/v1/role-tags', params: { limit: '20' } },
    { key: 'client_info', path: '/v1/client-info' },
    { key: 'health', path: '/health' },
  ];

  for (const ep of endpoints) {
    results[ep.key] = await proxyGet(ep.path, ep.params);
  }

  res.json({
    apiBase: API_BASE,
    apiKeyConfigured: !!API_KEY,
    timestamp: new Date().toISOString(),
    results,
  });
});

/**
 * GET /api/internal/gruene-api/divisions
 * Proxy for divisions search
 */
router.get('/divisions', async (req: Request, res: Response) => {
  if (!API_KEY) {
    res.status(503).json({ error: 'GRUENE_API_KEY not configured' });
    return;
  }

  const { level, search, limit, offset } = req.query as Record<string, string>;
  const result = await proxyGet('/v1/divisions', {
    ...(level ? { level } : {}),
    ...(search ? { search } : {}),
    limit: limit || '20',
    ...(offset ? { offset } : {}),
  });

  res.status(result.status).json(result.data);
});

export default router;
