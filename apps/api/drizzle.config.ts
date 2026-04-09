import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './database/schema/index.ts',
  out: './database/drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env['DATABASE_URL'] ?? '' },
});
