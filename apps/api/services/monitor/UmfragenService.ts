import { createLogger } from '../../utils/logger.js';

import { lookupMeinungsbildByTopic } from './MeinungsbildService.js';
import { getPolitProPolls } from './PolitProService.js';
import { findStateElection } from './StateElectionsService.js';

const log = createLogger('Umfragen');

function formatAverage(average: Record<string, number>, limit = 8): string {
  return Object.entries(average)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([party, value]) => `${party} ${value.toFixed(1)}%`)
    .join(', ');
}

/**
 * Build a Sonntagsfrage (party-poll) block for the chat. Per-Bundesland via
 * PolitPro when a state is given, otherwise the national PolitPro aggregate.
 */
async function sonntagsfrageBlock(bundesland?: string): Promise<string | null> {
  const state = bundesland ? await findStateElection(bundesland) : null;
  const parliament = state?.politProId ?? 'deutschland';
  const scope = state ? state.stateName : 'Deutschland (Bundestag)';

  try {
    const politpro = await getPolitProPolls(parliament);
    if (politpro && Object.keys(politpro.average).length > 0) {
      const date = politpro.polls.length > 1 ? politpro.polls[0]?.date : undefined;
      return [
        `Sonntagsfrage ${scope}${date ? ` (Stand: ${date})` : ''}:`,
        `  ${formatAverage(politpro.average)}`,
      ].join('\n');
    }
  } catch (error) {
    log.error(`PolitPro lookup failed (${parliament}): ${error}`);
  }

  return null;
}

/**
 * Combined opinion-poll lookup for the chat `@umfragen` mention. Merges:
 *  - Meinungsbild (MRP) issue estimates matching the topic, and
 *  - the Sonntagsfrage (party polls), national or for a given Bundesland.
 * Returns formatted chat context, or null if neither source yields anything.
 */
export async function lookupUmfragen(topic: string, bundesland?: string): Promise<string | null> {
  log.info(`[Umfragen] Lookup: "${topic}"${bundesland ? ` (${bundesland})` : ''}`);

  const [meinungsbild, sonntagsfrage] = await Promise.all([
    topic.trim() ? lookupMeinungsbildByTopic(topic).catch(() => null) : Promise.resolve(null),
    sonntagsfrageBlock(bundesland),
  ]);

  const parts: string[] = [];
  if (sonntagsfrage) parts.push(sonntagsfrage);
  if (meinungsbild) parts.push(meinungsbild);

  if (parts.length === 0) return null;

  return (
    parts.join('\n\n---\n\n') +
    '\n\nQuellen: Sonntagsfrage via PolitPro; Meinungsbild (MRP) aus GERDA — ' +
    'German Election Database (Heddesheimer, Hilbig, Sichart & Wiedemann, 2025).'
  );
}
