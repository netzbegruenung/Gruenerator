/**
 * AI party profiles for the EU greens deck.
 *
 * Fetches the party's Wikipedia article (MediaWiki Action API, plaintext
 * extract), summarizes it in German via the monitor AI provider and caches
 * the profile for a week. Parties without a Wikipedia article (SENS) get a
 * profile with `summary: null` and just the website link.
 */
import { euGreenProfileResponseSchema, type EuGreenProfileData } from '@gruenerator/contracts';
import { generateText } from 'ai';

import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';
import { getModel, getPreferredMonitorProvider } from '../ai/providers.js';

import { EU_GREEN_PARTIES, type EuGreenPartyEntry } from './PolitProService.js';

const log = createLogger('EuGreenProfile');

const PROFILE_TTL = 7 * 24 * 60 * 60;
const FETCH_TIMEOUT = 15000;
const WIKI_USER_AGENT = 'Gruenerator-Monitor/1.0 (https://gruenerator.eu)';
/** Plaintext budget passed to the summarizer. */
const EXTRACT_CHARS = 6000;

async function fetchWikipediaExtract(
  title: string,
  lang: string
): Promise<{ text: string; url: string } | null> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      prop: 'extracts',
      explaintext: '1',
      redirects: '1',
      exchars: String(EXTRACT_CHARS),
      format: 'json',
      titles: title,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const response = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, {
      headers: { 'User-Agent': WIKI_USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      log.warn(`Wikipedia API ${response.status} for "${title}" (${lang})`);
      return null;
    }

    const body = (await response.json()) as {
      query?: { pages?: Record<string, { title?: string; extract?: string; missing?: string }> };
    };
    const page = Object.values(body.query?.pages ?? {})[0];
    if (!page?.extract) {
      log.warn(`Wikipedia article missing or empty: "${title}" (${lang})`);
      return null;
    }

    const slug = encodeURIComponent((page.title ?? title).replace(/ /g, '_'));
    return { text: page.extract, url: `https://${lang}.wikipedia.org/wiki/${slug}` };
  } catch (error) {
    log.error(`Wikipedia fetch failed for "${title}" (${lang}): ${error}`);
    return null;
  }
}

async function summarize(entry: EuGreenPartyEntry, articleText: string): Promise<string | null> {
  try {
    const result = await generateText({
      model: getModel(getPreferredMonitorProvider()),
      prompt: `Fasse die folgende Wikipedia-Beschreibung der Partei "${entry.partyLabel}" (${entry.countryName}) sachlich und neutral auf Deutsch zusammen, in 100 bis 140 Wörtern. Gehe auf die politische Ausrichtung, die Geschichte in höchstens einem Satz und die aktuelle Rolle im Land ein. Antworte direkt mit dem Fließtext, ohne Einleitung oder Überschrift.

${articleText}`,
    });
    const text = result.text.trim();
    return text.length > 0 ? text : null;
  } catch (error) {
    log.error(`Summary generation failed for ${entry.partyLabel}: ${error}`);
    return null;
  }
}

export async function getEuGreenProfile(countryCode: string): Promise<EuGreenProfileData | null> {
  const entry = EU_GREEN_PARTIES.find((e) => e.countryCode === countryCode);
  if (!entry) return null;

  const cacheKey = `monitor:politpro:greens-profile:${countryCode}`;
  const cached = await getCachedJson(cacheKey, euGreenProfileResponseSchema);
  if (cached) return cached;

  let summary: string | null = null;
  let wikipediaUrl: string | null = null;

  if (entry.wikipedia) {
    const wiki = await fetchWikipediaExtract(entry.wikipedia, entry.wikipediaLang ?? 'de');
    if (wiki) {
      wikipediaUrl = wiki.url;
      summary = await summarize(entry, wiki.text);
    }
  }

  const profile: EuGreenProfileData = {
    countryCode: entry.countryCode,
    countryName: entry.countryName,
    party: entry.partyLabel,
    summary,
    website: entry.website,
    wikipediaUrl,
    generatedAt: new Date().toISOString(),
  };

  // Only cache complete profiles; a transient Wikipedia/AI failure should be
  // retried on the next request instead of sticking for a week.
  if (summary !== null || !entry.wikipedia) {
    await setCachedJson(cacheKey, profile, PROFILE_TTL);
  }
  return profile;
}
