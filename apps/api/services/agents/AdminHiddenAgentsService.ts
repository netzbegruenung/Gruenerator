import { eq } from 'drizzle-orm';

import { adminHiddenAgents } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('AdminHiddenAgentsService');

/** Agent-`identifier`, die ein Admin auf diesem Deployment ausgeblendet hat. */
export async function getHiddenAgentIdentifiers(): Promise<string[]> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({ agent_identifier: adminHiddenAgents.agent_identifier })
    .from(adminHiddenAgents);
  return rows.map((r) => r.agent_identifier);
}

export async function hideAgent(identifier: string, hiddenBy: string): Promise<void> {
  const db = getDrizzleInstance();
  await db
    .insert(adminHiddenAgents)
    .values({ agent_identifier: identifier, hidden_by: hiddenBy })
    .onConflictDoNothing({ target: adminHiddenAgents.agent_identifier });
}

export async function unhideAgent(identifier: string): Promise<void> {
  const db = getDrizzleInstance();
  await db.delete(adminHiddenAgents).where(eq(adminHiddenAgents.agent_identifier, identifier));
}

/**
 * Dieselbe Liste, im Prozess für {@link HIDDEN_AGENTS_TTL_MS} gepuffert.
 *
 * Für den heißen Pfad: das Agenten-Inventar wird bei **jedem** Chat-Turn in den
 * Systemprompt geschrieben, eine Datenbankrunde pro Turn für eine Tabelle mit
 * meist null Zeilen wäre verschwendet. Der Admin-Router nimmt bewusst die
 * ungepufferte Fassung — wer gerade geschaltet hat, muss es sofort sehen.
 */
const HIDDEN_AGENTS_TTL_MS = 60_000;
let cache: { identifiers: string[]; expiresAt: number } | null = null;

export async function getHiddenAgentIdentifiersCached(now = Date.now()): Promise<string[]> {
  if (cache && cache.expiresAt > now) return cache.identifiers;
  try {
    const identifiers = await getHiddenAgentIdentifiers();
    cache = { identifiers, expiresAt: now + HIDDEN_AGENTS_TTL_MS };
    return identifiers;
  } catch (error) {
    // Fail-open, wie auf der Client-Seite: ein Ausfall zeigt zu viel, nie zu
    // wenig. Andersherum verlöre der Systemprompt sein halbes Inventar, und
    // zwar unbemerkt. Nicht gepuffert, damit der nächste Turn es neu versucht.
    log.warn('Ausgeblendete Agenten nicht lesbar — Inventar bleibt vollständig.', error);
    return [];
  }
}

/** Nach einem Schaltvorgang, damit der nächste Turn nicht die alte Liste sieht. */
export function clearHiddenAgentsCache(): void {
  cache = null;
}
