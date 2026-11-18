import { describe, expect, it } from 'vitest';

import { PostgresService } from './PostgresService.js';

function serviceWithPool(query: () => Promise<unknown>): PostgresService {
  const service = new PostgresService();
  // Boundary cast: checkHealth only touches pool.query.
  service.pool = { query } as unknown as PostgresService['pool'];
  return service;
}

describe('PostgresService.checkHealth', () => {
  it('reports disconnected before init created a pool', async () => {
    const service = new PostgresService();
    service.lastError = 'connect ECONNREFUSED 172.17.0.1:5432';

    expect(await service.checkHealth()).toEqual({
      connected: false,
      error: 'connect ECONNREFUSED 172.17.0.1:5432',
    });
  });

  it('reports connected when SELECT 1 succeeds', async () => {
    const service = serviceWithPool(() => Promise.resolve({ rows: [{ '?column?': 1 }] }));

    expect(await service.checkHealth()).toEqual({ connected: true });
  });

  it('reports disconnected when the database went away after init', async () => {
    const service = serviceWithPool(() => Promise.reject(new Error('Connection terminated')));
    service.isHealthy = true;

    expect(await service.checkHealth()).toEqual({
      connected: false,
      error: 'Connection terminated',
    });
  });

  it('gives up after the timeout instead of hanging the health check', async () => {
    const service = serviceWithPool(() => new Promise(() => {}));

    expect(await service.checkHealth(20)).toEqual({
      connected: false,
      error: 'timeout after 20ms',
    });
  });
});
