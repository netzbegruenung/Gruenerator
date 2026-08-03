import { type InferSelectModel } from 'drizzle-orm';
import { boolean, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Per-user opt-out for MANAGED MCP connectors (EXPERIMENTAL).
 *
 * Managed connectors are first-party servers configured from env
 * (`services/mcp/systemMcpServers.ts`) and offered to every user WITHOUT a
 * `mcp_servers` row — there is no per-user URL, name or credential to store.
 * The only per-user fact is "did this person switch it off", so that is the only
 * thing this table holds.
 *
 * SPARSE BY DESIGN: absence means the default (`enabled = true`). Seeding a row
 * per user per connector would mean a backfill today, a backfill for every new
 * user, and a backfill for every connector added later — three migrations to
 * express a default that a missing row already expresses.
 *
 * `system_key` is a `SystemMcpKey`, deliberately stored as free TEXT: a
 * connector that is retired leaves rows behind, and a CHECK constraint or enum
 * would turn that into a failing migration instead of a row nobody reads.
 */
export const mcp_system_prefs = pgTable(
  'mcp_system_prefs',
  {
    user_id: uuid('user_id').notNull(),
    system_key: text('system_key').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.user_id, table.system_key] })]
);

export type McpSystemPref = InferSelectModel<typeof mcp_system_prefs>;
