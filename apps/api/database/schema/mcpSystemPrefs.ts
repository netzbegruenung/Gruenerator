import { type InferSelectModel } from 'drizzle-orm';
import { boolean, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Per-user switch for the former MANAGED MCP connectors — NO LONGER READ.
 *
 * Since 11.11.2026 a connected Bahn/Wetter/… connector is an ordinary
 * `mcp_servers` row with `registry_key` set; migration
 * `zz_20261111_mcp_servers_registry_key.sql` turned every `enabled = true` row
 * here into such a row. The table stays (F0: a schema change is additive);
 * drop no earlier than 2027-05. Kept as a Drizzle table only so that drop is a
 * deliberate, visible step.
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
