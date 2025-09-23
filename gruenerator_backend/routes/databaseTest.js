const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

/**
 * Database Test Route
 * Tests PostgreSQL database schema and creates missing tables if requested
 */
router.get('/test', async (req, res) => {
  try {
    console.log('[DatabaseTest] Starting database schema test');

    // Get create parameter - allows creating missing tables
    const createMissing = req.query.create === 'true';

    // Import PostgresService dynamically
    const { getPostgresInstance } = await import('../database/services/PostgresService.js');
    const postgresService = getPostgresInstance();

    // Check if PostgreSQL connection is available
    const health = postgresService.getHealth();
    if (!health.isHealthy) {
      return res.status(503).json({
        success: false,
        error: 'Database connection not available',
        health: health,
        message: `Database status: ${health.status}. Last error: ${health.lastError || 'None'}`
      });
    }

    console.log('[DatabaseTest] Database connection is healthy');

    // Read schema.sql file
    const schemaPath = path.join(__dirname, '../database/postgres/schema.sql');
    if (!fs.existsSync(schemaPath)) {
      return res.status(404).json({
        success: false,
        error: 'Schema file not found',
        path: schemaPath
      });
    }

    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    console.log('[DatabaseTest] Schema file loaded successfully');

    // Parse expected tables from schema.sql
    const expectedTables = extractTablesFromSchema(schemaContent);
    console.log('[DatabaseTest] Expected tables:', expectedTables);

    // Get existing tables from database
    const existingTablesQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    const existingTablesResult = await postgresService.query(existingTablesQuery);
    const existingTables = existingTablesResult.map(row => row.table_name);
    console.log('[DatabaseTest] Existing tables:', existingTables);

    // Find missing tables
    const missingTables = expectedTables.filter(table => !existingTables.includes(table));
    console.log('[DatabaseTest] Missing tables:', missingTables);

    let createdTables = [];
    let creationErrors = [];

    // Create missing tables if requested
    if (createMissing && missingTables.length > 0) {
      console.log(`[DatabaseTest] Creating ${missingTables.length} missing tables`);

      try {
        // Execute full schema to create missing tables
        await postgresService.query(schemaContent);
        createdTables = [...missingTables]; // Assume all were created successfully
        console.log('[DatabaseTest] Schema execution completed');
      } catch (error) {
        console.error('[DatabaseTest] Error creating tables:', error.message);
        creationErrors.push({
          error: error.message,
          tables: missingTables
        });
      }
    }

    // Get final table count
    const finalTablesResult = await postgresService.query(existingTablesQuery);
    const finalTables = finalTablesResult.map(row => row.table_name);

    // Prepare response
    const response = {
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

    console.log('[DatabaseTest] Test completed successfully');
    res.json(response);

  } catch (error) {
    console.error('[DatabaseTest] Error during database test:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      type: 'DatabaseTestError',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Extract table names from CREATE TABLE statements in schema.sql
 */
function extractTablesFromSchema(schemaContent) {
  const tableMatches = schemaContent.match(/CREATE TABLE IF NOT EXISTS (\w+)/g);
  if (!tableMatches) return [];

  return tableMatches.map(match => {
    const tableName = match.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1];
    return tableName;
  });
}

module.exports = router;