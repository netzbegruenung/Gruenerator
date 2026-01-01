/**
 * SQL query builder helpers
 */

import type { PoolClient } from 'pg';
import type { ExecResult } from './types.js';

/**
 * Build INSERT query
 */
export function buildInsertQuery(
  table: string,
  data: Record<string, unknown>
): { sql: string; values: unknown[] } {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = values.map((_, index) => `$${index + 1}`);

  const sql = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
    RETURNING *
  `;

  return { sql, values };
}

/**
 * Build UPDATE query
 */
export function buildUpdateQuery(
  table: string,
  data: Record<string, unknown>,
  whereConditions: Record<string, unknown>
): { sql: string; values: unknown[] } {
  const dataColumns = Object.keys(data);
  const whereColumns = Object.keys(whereConditions);

  const setClause = dataColumns.map((key, index) => `${key} = $${index + 1}`);
  const whereClause = whereColumns.map((key, index) =>
    `${key} = $${dataColumns.length + index + 1}`
  );

  const sql = `
    UPDATE ${table}
    SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE ${whereClause.join(' AND ')}
    RETURNING *
  `;

  const values = [...Object.values(data), ...Object.values(whereConditions)];

  return { sql, values };
}

/**
 * Build DELETE query
 */
export function buildDeleteQuery(
  table: string,
  whereConditions: Record<string, unknown>
): { sql: string; values: unknown[] } {
  const whereColumns = Object.keys(whereConditions);
  const whereClause = whereColumns.map((key, index) => `${key} = $${index + 1}`);

  const sql = `DELETE FROM ${table} WHERE ${whereClause.join(' AND ')} RETURNING *`;
  const values = Object.values(whereConditions);

  return { sql, values };
}

/**
 * Build UPSERT query
 */
export function buildUpsertQuery(
  table: string,
  data: Record<string, unknown>,
  conflictColumns: string[] = ['id']
): { sql: string; values: unknown[] } {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = values.map((_, index) => `$${index + 1}`);

  const updateColumns = columns.filter(col => !conflictColumns.includes(col));
  const updateClause = updateColumns.map(col => `${col} = EXCLUDED.${col}`).join(', ');

  const sql = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT (${conflictColumns.join(', ')})
    DO UPDATE SET ${updateClause}
    RETURNING *
  `;

  return { sql, values };
}

/**
 * Build bulk INSERT query
 */
export function buildBulkInsertQuery(
  table: string,
  records: Record<string, unknown>[]
): { sql: string; values: unknown[] } {
  if (!records.length) {
    return { sql: '', values: [] };
  }

  const columns = Object.keys(records[0]);

  const valuesClause = records.map((_, recordIndex) => {
    const placeholders = columns.map((_, colIndex) =>
      `$${recordIndex * columns.length + colIndex + 1}`
    );
    return `(${placeholders.join(', ')})`;
  }).join(', ');

  const values = records.flatMap(record => Object.values(record));

  const sql = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES ${valuesClause}
    RETURNING *
  `;

  return { sql, values };
}

/**
 * Transaction-aware query method
 */
export async function transactionQuery(
  client: PoolClient,
  sql: string,
  params: unknown[] = []
): Promise<Record<string, unknown>[]> {
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } catch (error) {
    console.error('[PostgresService] Transaction query error:', error, { sql, params });
    throw new Error(`Transaction SQL query failed: ${(error as Error).message}`);
  }
}

/**
 * Transaction-aware single query method
 */
export async function transactionQueryOne(
  client: PoolClient,
  sql: string,
  params: unknown[] = []
): Promise<Record<string, unknown> | null> {
  const results = await transactionQuery(client, sql, params);
  return results.length > 0 ? results[0] : null;
}

/**
 * Transaction-aware exec method
 */
export async function transactionExec(
  client: PoolClient,
  sql: string,
  params: unknown[] = []
): Promise<ExecResult> {
  try {
    const result = await client.query(sql, params);
    return { changes: result.rowCount || 0, lastID: result.rows[0]?.id };
  } catch (error) {
    console.error('[PostgresService] Transaction exec error:', error, { sql, params });
    throw new Error(`Transaction SQL execution failed: ${(error as Error).message}`);
  }
}
