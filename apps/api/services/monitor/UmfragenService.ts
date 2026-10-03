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

async function resolveRegion(
  region: string,
  country: PolitProCountry
): Promise<{ id: string; scope: string } | null> {
  const match = resolveParliamentByName(region, country);
  if (match) {
    const national = nationalParliament(country);
    return match.id === national.id ? national : { id: match.id, scope: match.name };
  }
  if (country === 'AT') return null;
  const state = await findStateElection(region).catch(() => null);
  return state ? { id: state.politProId, scope: state.stateName } : null;
}

/**
 * Build a Sonntagsfrage (party-poll) block for the chat. Per-region via
 * PolitPro when one is named, otherwise the national aggregate FOR THE USER'S
 * COUNTRY.
 *
 * A named region resolves against the PolitPro parliament list, which covers
 * the Bundestag, the Nationalrat and all 25 Länder. Germany additionally falls
 * back to `findStateElection` for short codes ("BY", "NRW"). It used to be the
 * ONLY German path, and it reads `monitor_state_elections` (GERDA seed): with
 * that table empty, "Bayern" answered with the Bundestag, labelled as such and
 * without a word about the dropped region (#4063).
 *
 * A region that resolves nowhere still gets the national numbers, but says so.
 */
async function sonntagsfrageBlock(
  region: string | undefined,
  country: PolitProCountry
): Promise<string | null> {
  const national = nationalParliament(country);
  const resolved = region?.trim() ? await resolveRegion(region, country) : null;
  const { id: parliament, scope } = resolved ?? national;
  const unresolvedNote =
    region?.trim() && !resolved
      ? `Für „${region.trim()}“ gibt es keine eigene Sonntagsfrage — stattdessen bundesweit:\n`
      : '';

  try {
    const politpro = await getPolitProPolls(parliament);
    if (politpro && Object.keys(politpro.average).length > 0) {
      const date = politpro.polls.length > 1 ? politpro.polls[0]?.date : undefined;
      return [
        `${unresolvedNote}Sonntagsfrage ${scope}${date ? ` (Stand: ${date})` : ''}:`,
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
