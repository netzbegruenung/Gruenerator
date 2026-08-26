/**
 * Admin-kuratierte Agenten-Sichtbarkeit — das Gegenstück zu
 * `admin_hidden_agents` (apps/api/database/schema/adminHiddenAgents.ts) und die
 * Zwillingsschwester von `skillVisibility.ts`.
 *
 * Nur Entdeckung, gleiches Prinzip wie überall sonst: ein ausgeblendeter Agent
 * verschwindet aus Galerien, Seitenleiste, Suche und dem Inventar, das dem
 * Modell beschrieben wird — `getSystemAgent()` und `/agents/<slug>` bleiben
 * ungefiltert, damit ein geteilter Link nie ins Leere führt.
 *
 * Schlüssel ist der `identifier`. Bei Rezepten wäre das falsch (dort benennt er
 * den besitzenden Agenten, den sich mehrere teilen) — beim Agenten ist er er
 * selbst.
 */
export function isAdminVisibleAgent(
  identifier: string,
  hiddenIdentifiers: readonly string[]
): boolean {
  return !hiddenIdentifiers.includes(identifier);
}
