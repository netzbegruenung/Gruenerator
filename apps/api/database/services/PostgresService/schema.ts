/**
 * Schema parsing, validation, and synchronization
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import type { SchemaCache, ColumnDefinition, AlterStatement } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse schema.sql file to extract table definitions and columns
 */
export function parseSchemaFile(schemaContent: string): SchemaCache {
  const tables: SchemaCache = {};

  const tableMatches = schemaContent.match(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\);/g);

  if (!tableMatches) return tables;

  tableMatches.forEach((tableMatch) => {
    const tableNameMatch = tableMatch.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
    if (!tableNameMatch) return;

    const tableName = tableNameMatch[1];

    const columnSectionMatch = tableMatch.match(/CREATE TABLE IF NOT EXISTS \w+\s*\(([\s\S]*)\);/);
    if (!columnSectionMatch) return;

    const columnSection = columnSectionMatch[1];
    const columns: ColumnDefinition[] = [];

    const lines = columnSection
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line);

    for (const line of lines) {
      if (
        line.startsWith('--') ||
        line.startsWith('CONSTRAINT') ||
        line.startsWith('UNIQUE(') ||
        line.startsWith('CHECK(') ||
        line.startsWith('PRIMARY KEY(') ||
        line.startsWith('FOREIGN KEY')
      ) {
        continue;
      }

      const columnMatch = line.match(
        /^([a-zA-Z_]\w*)\s+([A-Z]+(?:\([^)]+\))?(?:\s*\[\])?)\s*(.*?)(?:,\s*)?$/
      );
      if (columnMatch) {
        const [, columnName, dataType, constraints] = columnMatch;
        columns.push({
          name: columnName,
          type: dataType,
          constraints: constraints.trim(),
        });
      }
    }

    if (columns.length > 0) {
      tables[tableName] = columns;
    }
  });

  // Second pass: extract ALTER TABLE ADD COLUMN statements
  const alterMatches = schemaContent.match(
    /ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?(\w+)\s+([^;]+);/gi
  );

  if (alterMatches) {
    for (const alterMatch of alterMatches) {
      const match = alterMatch.match(
        /ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?(\w+)\s+([^;]+);/i
      );
      if (!match) continue;

      const [, tableName, columnName, rest] = match;

      const typeMatch = rest.trim().match(/^(\S+(?:\(\d+\))?)\s*([\s\S]*)?$/);
      if (!typeMatch) continue;

      const dataType = typeMatch[1];
      let constraints = (typeMatch[2] || '').trim();

      // Strip REFERENCES clauses (sync can't add foreign keys)
      constraints = constraints
        .replace(/REFERENCES\s+\w+\([^)]+\)(\s+ON\s+\w+\s+\w+)*/gi, '')
        .trim();
      // Strip CHECK constraints (handles nested parens like IN (...))
      constraints = constraints.replace(/CHECK\s*\((?:[^()]*|\([^()]*\))*\)/gi, '').trim();

      if (!tables[tableName]) {
        tables[tableName] = [];
      }

      const exists = tables[tableName].some((col) => col.name === columnName);
      if (!exists) {
        tables[tableName].push({
          name: columnName,
          type: dataType,
          constraints,
        });
      }
    }
  }

  return tables;
}

/**
 * Extract individual CREATE TABLE IF NOT EXISTS statements from schema content.
 * Returns a map of table name → full SQL statement.
 */
export function extractCreateTableStatements(schemaContent: string): Record<string, string> {
  const statements: Record<string, string> = {};
  const matches = schemaContent.match(/CREATE TABLE IF NOT EXISTS \w+\s*\([\s\S]*?\);/g);

  if (!matches) return statements;

  for (const sql of matches) {
    const nameMatch = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
    if (nameMatch) {
      statements[nameMatch[1]] = sql;
    }
  }

  return statements;
}

/**
 * Get the path to schema.sql file
 */
export function getSchemaPath(): string {
  return path.join(__dirname, '../../postgres/schema.sql');
}

/**
 * Get the path to migrations directory
 */
export function getMigrationsPath(): string {
  return path.join(__dirname, '../../migrations');
}

/**
 * Load and parse schema from file
 */
export function loadSchemaCache(): SchemaCache | null {
  try {
    const schemaPath = getSchemaPath();

    if (!fs.existsSync(schemaPath)) {
      console.warn('[PostgresService] Schema file not found, schema validation disabled');
      return null;
    }

    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    const cache = parseSchemaFile(schemaContent);

    console.log(
      `[PostgresService] Schema validation initialized with ${Object.keys(cache).length} tables`
    );
    return cache;
  } catch (error) {
    console.error(
      '[PostgresService] Failed to initialize schema validation:',
      (error as Error).message
    );
    return null;
  }
}

/**
 * Validate table name against schema whitelist
 */
export function validateTableName(schemaCache: SchemaCache | null, tableName: string): void {
  if (!schemaCache) return;

  if (!schemaCache[tableName]) {
    throw new Error(`Invalid table name: ${tableName}. Table not found in schema.`);
  }
}

/**
 * Validate column names against schema whitelist for a given table
 */
export function validateColumnNames(
  schemaCache: SchemaCache | null,
  tableName: string,
  columnNames: string[]
): void {
  if (!schemaCache) return;

  validateTableName(schemaCache, tableName);

  const validColumns = schemaCache[tableName].map((col) => col.name);

  for (const columnName of columnNames) {
    if (!validColumns.includes(columnName)) {
      throw new Error(
        `Invalid column name: ${columnName} for table ${tableName}. Column not found in schema.`
      );
    }
  }
}

/**
 * Generate ALTER statements for missing columns
 */
export function generateAlterStatements(
  expectedTables: SchemaCache,
  existingTables: Record<string, ColumnDefinition[]>
): AlterStatement[] {
  const alterStatements: AlterStatement[] = [];

  for (const [tableName, expectedColumns] of Object.entries(expectedTables)) {
    const existingColumns = existingTables[tableName] || [];
    const existingColumnNames = existingColumns.map((col) => col.name);

    for (const expectedColumn of expectedColumns) {
      if (!existingColumnNames.includes(expectedColumn.name)) {
        let alterStatement = `ALTER TABLE ${tableName} ADD COLUMN ${expectedColumn.name} ${expectedColumn.type}`;

        if (expectedColumn.constraints) {
          if (expectedColumn.constraints.includes('NOT NULL')) {
            if (expectedColumn.constraints.includes('DEFAULT')) {
              alterStatement += ` ${expectedColumn.constraints}`;
            } else {
              const constraintsWithoutNotNull = expectedColumn.constraints
                .replace(/NOT NULL/g, '')
                .trim();
              if (constraintsWithoutNotNull) {
                alterStatement += ` ${constraintsWithoutNotNull}`;
              }
            }
          } else {
            alterStatement += ` ${expectedColumn.constraints}`;
          }
        }

        alterStatements.push({
          table: tableName,
          column: expectedColumn.name,
          statement: alterStatement,
        });
      }
    }
  }

  return alterStatements;
}

/**
 * Sanitize backup path to prevent path traversal and command injection
 */
export function sanitizeBackupPath(backupPath: string): string {
  if (!backupPath || typeof backupPath !== 'string') {
    throw new Error('Invalid backup path: path must be a non-empty string');
  }

  if (backupPath.includes('\0')) {
    throw new Error('Invalid backup path: contains null bytes');
  }

  const normalizedPath = path.normalize(backupPath);
  const resolvedPath = path.resolve(normalizedPath);

  const backupDir = process.env.BACKUP_DIR || path.join(__dirname, '../../../backups');
  const allowedBackupDir = path.resolve(backupDir);

  if (!resolvedPath.startsWith(allowedBackupDir + path.sep) && resolvedPath !== allowedBackupDir) {
    throw new Error(`Invalid backup path: must be within ${allowedBackupDir}`);
  }

  const dangerousPatterns = [/\.\./, /[;&|`$()]/, /\s*>/, /\s*</];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(backupPath)) {
      throw new Error('Invalid backup path: contains dangerous characters or patterns');
    }
  }

  const parentDir = path.dirname(resolvedPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  return resolvedPath;
}
