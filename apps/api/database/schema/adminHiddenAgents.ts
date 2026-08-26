import { type InferSelectModel } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Ausnahmetabelle, keine Erlaubnisliste: eine Zeile heißt „ein Admin hat diesen
// Agenten auf DIESEM Deployment aus der Entdeckung genommen". Leere Tabelle =
// jeder Agent sichtbar = wirkungslos auf jeder Instanz, bis jemand kuratiert —
// dasselbe `hidden`-≠-`blocked`-Prinzip wie bei der Instanz-Politik in
// packages/shared/src/instances (Direktlink und `getSystemAgent()` lösen weiter
// auf, nur Entdeckungsflächen lesen diese Tabelle).
//
// Schlüssel ist `identifier`, und anders als bei `admin_hidden_skills` ist das
// hier der richtige Schlüssel: beim Rezept benennt der Identifier den
// besitzenden Agenten und 18 Rezepte teilen sich 8 davon; beim Agenten ist er
// er selbst und eindeutig (`SystemAgentId`).
//
// Bewusst KEINE Kaskade auf die Rezepte des Agenten: ein Rezept und sein
// Besitzer sind zwei Angebote, und ein Rezept, das in seiner eigenen Liste als
// sichtbar steht und trotzdem verschwindet, wäre schwerer zu erklären als zwei
// Schalter.
export const adminHiddenAgents = pgTable('admin_hidden_agents', {
  agent_identifier: text('agent_identifier').primaryKey(),
  hidden_at: timestamp('hidden_at', { withTimezone: true }).notNull().defaultNow(),
  hidden_by: text('hidden_by'),
});

export type AdminHiddenAgent = InferSelectModel<typeof adminHiddenAgents>;
