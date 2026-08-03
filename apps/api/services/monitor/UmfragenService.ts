import { createLogger } from '../../utils/logger.js';

import { lookupMeinungsbildByTopic } from './MeinungsbildService.js';
import {
  getPolitProPolls,
  nationalParliament,
  resolveParliamentByName,
  type PolitProCountry,
} from './PolitProService.js';
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
 * Build a Sonntagsfrage (party-poll) block for the chat. Per-region via
 * PolitPro when one is named, otherwise the national aggregate FOR THE USER'S
 * COUNTRY.
 *
 * The two region lookups are deliberately different. Germany resolves through
 * `findStateElection`, which is backed by `monitor_state_elections` (seeded
 * from GERDA, the German Election Database) and carries election metadata.
 * Austria has no such table, so it resolves by name against the PolitPro
 * parliament list — which covers the Nationalrat and all nine Länder.
 */
async function sonntagsfrageBlock(
  region: string | undefined,
  country: PolitProCountry
): Promise<string | null> {
  const fallback = nationalParliament(country);
  let parliament = fallback.id;
  let scope = fallback.scope;

  if (region) {
    if (country === 'AT') {
      const match = resolveParliamentByName(region, 'AT');
      if (match) {
        parliament = match.id;
        scope = match.name;
      }
    } else {
      const state = await findStateElection(region);
      if (state) {
        parliament = state.politProId;
        scope = state.stateName;
      }
    }
  }

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
 *  - the Sonntagsfrage (party polls), national or for a given region.
 * Returns formatted chat context, or null if neither source yields anything.
 *
 * `locale` decides which country's polls this is about. It defaults to de-DE so
 * the Monitor callers, which have no user locale, keep their behaviour.
 */
export async function lookupUmfragen(
  topic: string,
  region?: string,
  locale: 'de-DE' | 'de-AT' = 'de-DE'
): Promise<string | null> {
  const country: PolitProCountry = locale === 'de-AT' ? 'AT' : 'DE';
  log.info(`[Umfragen] Lookup: "${topic}"${region ? ` (${region})` : ''} country=${country}`);

  // Meinungsbild (MRP) is GERDA — German survey data with no Austrian
  // counterpart. Approximating Austrian issue positions from German
  // respondents would be the same category error as answering an Austrian
  // poll question with the Bundestag, so AT gets the Sonntagsfrage only.
  const [meinungsbild, sonntagsfrage] = await Promise.all([
    country === 'DE' && topic.trim()
      ? lookupMeinungsbildByTopic(topic).catch(() => null)
      : Promise.resolve(null),
    sonntagsfrageBlock(region, country),
  ]);

  const parts: string[] = [];
  if (sonntagsfrage) parts.push(sonntagsfrage);
  if (meinungsbild) parts.push(meinungsbild);

  if (parts.length === 0) return null;

  // Cite only what is actually in the answer. The GERDA attribution used to be
  // appended unconditionally — including on turns that carry no Meinungsbild
  // block at all, which is every Austrian turn and every German one whose topic
  // matched nothing.
  const sources = ['Sonntagsfrage via PolitPro'];
  if (meinungsbild) {
    sources.push(
      'Meinungsbild (MRP) aus GERDA — German Election Database ' +
        '(Heddesheimer, Hilbig, Sichart & Wiedemann, 2025)'
    );
  }

  return parts.join('\n\n---\n\n') + `\n\nQuellen: ${sources.join('; ')}.`;
}
