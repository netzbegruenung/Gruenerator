import { type InferSelectModel } from 'drizzle-orm';
import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Dauerhafte Freigaben („immer erlauben") für Werkzeuge im Chat.
 *
 * SPARSE BY DESIGN wie `mcp_system_prefs`: eine fehlende Zeile IST die
 * Vorgabe (fragen). Nur die bewusste Entscheidung wird gespeichert.
 *
 * `scope_key` ist freies TEXT (`mcp:<serverId>/<tool>`, `managed:<key>/<tool>`,
 * `internal/<tool>`) — ein getrennter Server hinterlässt eine tote Zeile statt
 * einer scheiternden Fremdschlüsselprüfung; `approvalPolicy.ts` baut den
 * Schlüssel.
 */
export const chat_tool_approvals = pgTable(
  'chat_tool_approvals',
  {
    user_id: uuid('user_id').notNull(),
    scope_key: text('scope_key').notNull(),
    /** Anzeigename fürs Einstellungs-UI; der Server kann später weg sein. */
    tool_label: text('tool_label'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.user_id, table.scope_key] })]
);

export type ChatToolApproval = InferSelectModel<typeof chat_tool_approvals>;
