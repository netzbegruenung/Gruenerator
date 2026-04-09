import { drizzle } from 'drizzle-orm/node-postgres';

import * as schema from '../schema/index.js';

import { getPostgresInstance } from './PostgresService/PostgresService.js';

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

let instance: DrizzleDB | null = null;

export function getDrizzleInstance(): DrizzleDB {
  if (!instance) {
    const postgres = getPostgresInstance();
    if (!postgres.pool) throw new Error('PostgresService pool not initialized');
    instance = drizzle(postgres.pool, { schema });
  }
  return instance;
}
