/**
 * „Hat dieses Konto Jira und/oder Confluence verbunden?" — das Tor für das
 * Werkzeug `atlassian` im Katalog dieses Turns.
 *
 * Der Katalog wird synchron gebaut und kann die Frage nicht selbst stellen;
 * deshalb hier ein kleiner Prozess-Cache mit kurzer Lebensdauer, derselbe
 * Zuschnitt wie `countCloudConnections`. Ein Nango-Ausfall darf den Turn nicht
 * brechen: dann gilt „nicht verbunden", es wird geloggt und nicht gecacht.
 */
import { ConnectionService } from '../../../services/connections/ConnectionService.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('atlassianConnectionContext');

const TTL_MS = 60_000;

export interface AtlassianConnections {
  jira: boolean;
  confluence: boolean;
}

export const NO_ATLASSIAN: AtlassianConnections = { jira: false, confluence: false };

const cache = new Map<string, { at: number; value: AtlassianConnections }>();

/** Nur für Tests: den Prozess-Cache leeren. */
export function resetAtlassianConnectionCache(): void {
  cache.clear();
}

export async function getAtlassianConnections(userId: string): Promise<AtlassianConnections> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const all = await ConnectionService.listConnections(userId);
    const value: AtlassianConnections = {
      jira: all.some((c) => c.provider === 'jira' && c.connected),
      confluence: all.some((c) => c.provider === 'confluence' && c.connected),
    };
    cache.set(userId, { at: Date.now(), value });
    return value;
  } catch (err) {
    log.warn('atlassian connection lookup failed — treating as not connected', err);
    return NO_ATLASSIAN;
  }
}
