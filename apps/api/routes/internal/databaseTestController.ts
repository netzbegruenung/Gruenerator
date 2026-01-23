import express, { Request, Response, Router } from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('databaseTest');
const router: Router = express.Router();

interface TableInfo {
  table_name: string;
}

interface DatabaseHealth {
  isHealthy: boolean;
  status: string;
  lastError?: string;
  pool?: unknown;
}

interface DatabaseTestResponse {
  success: boolean;
  error?: string;
  health?: DatabaseHealth;
  message?: string;
  database?: {
    connection: string;
    status: string;
    pool: unknown;
  };
  schema?: {
    file_path: string;
    expected_tables_count: number;
    existing_tables_count: number;
    missing_tables_count: number;
  };
  tables?: {
    expected: string[];
    existing: string[];
    missing: string[];
    created: string[];
  };
  actions?: {
    create_requested: boolean;
    tables_created: number;
    creation_errors: Array<{ error: string; tables: string[] }>;
  };
  type?: string;
  timestamp?: string;
  path?: string;
}

function extractTablesFromSchema(schemaContent: string): string[] {
  const tableMatches = schemaContent.match(/CREATE TABLE IF NOT EXISTS (\w+)/g);
  if (!tableMatches) return [];

  return tableMatches.map(match => {
    const tableNameMatch = match.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
    return tableNameMatch ? tableNameMatch[1] : '';
  }).filter(Boolean);
}

router.get('/test', async (req: Request, res: Response) => {
  try {
    log.debug('[DatabaseTest] Starting database schema test');

    const createMissing = req.query.create === 'true';

    const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
    const postgresService = getPostgresInstance();

    const health = postgresService.getHealth() as DatabaseHealth;
    if (!health.isHealthy) {
      return res.status(503).json({
        success: false,
        error: 'Database connection not available',
        health: health,
        message: `Database status: ${health.status}. Last error: ${health.lastError || 'None'}`
      } as DatabaseTestResponse);
    }

    log.debug('[DatabaseTest] Database connection is healthy');

    const schemaPath = path.join(__dirname, '../../database/postgres/schema.sql');
    if (!fs.existsSync(schemaPath)) {
      return res.status(404).json({
        success: false,
        error: 'Schema file not found',
        path: schemaPath
      } as DatabaseTestResponse);
    }

    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    log.debug('[DatabaseTest] Schema file loaded successfully');

    const expectedTables = extractTablesFromSchema(schemaContent);
    log.debug('[DatabaseTest] Expected tables:', expectedTables);

    const existingTablesQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    const existingTablesResult = await postgresService.query(existingTablesQuery) as unknown as TableInfo[];
    const existingTables = existingTablesResult.map(row => row.table_name);
    log.debug('[DatabaseTest] Existing tables:', existingTables);

    const missingTables = expectedTables.filter(table => !existingTables.includes(table));
    log.debug('[DatabaseTest] Missing tables:', missingTables);

    const createdTables: string[] = [];
    const creationErrors: Array<{ error: string; tables: string[] }> = [];

    if (createMissing && missingTables.length > 0) {
      log.debug(`[DatabaseTest] Creating ${missingTables.length} missing tables`);

      try {
        await postgresService.query(schemaContent);
        createdTables.push(...missingTables);
        log.debug('[DatabaseTest] Schema execution completed');
      } catch (error) {
        log.error('[DatabaseTest] Error creating tables:', (error as Error).message);
        creationErrors.push({
          error: (error as Error).message,
          tables: missingTables
        });
      }
    }

    const finalTablesResult = await postgresService.query(existingTablesQuery) as unknown as TableInfo[];
    const finalTables = finalTablesResult.map(row => row.table_name);

    const response: DatabaseTestResponse = {
      success: true,
      database: {
        connection: 'healthy',
        status: health.status,
        pool: health.pool
      },
      schema: {
        file_path: schemaPath,
        expected_tables_count: expectedTables.length,
        existing_tables_count: finalTables.length,
        missing_tables_count: expectedTables.filter(table => !finalTables.includes(table)).length
      },
      tables: {
        expected: expectedTables,
        existing: finalTables,
        missing: expectedTables.filter(table => !finalTables.includes(table)),
        created: createdTables
      },
      actions: {
        create_requested: createMissing,
        tables_created: createdTables.length,
        creation_errors: creationErrors
      }
    };

    log.debug('[DatabaseTest] Test completed successfully');
    return res.json(response);

  } catch (error) {
    log.error('[DatabaseTest] Error during database test:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
      type: 'DatabaseTestError',
      timestamp: new Date().toISOString()
    } as DatabaseTestResponse);
  }
});

export default router;
