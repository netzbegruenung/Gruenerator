import dotenv from 'dotenv';
import { Client } from 'pg';
import { readFileSync } from 'fs';

// Load environment variables
dotenv.config();

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres', // Default local postgres password
  database: 'gruenerator',
  ssl: false
});

async function runMigration() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    const migrationSQL = readFileSync('./migrations/add_locale_column.sql', 'utf8');
    await client.query(migrationSQL);

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await client.end();
  }
}

runMigration();