import { generateText } from 'ai';

import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import { getBriefingModel } from './aiProvider.js';

import type { BriefingConfig, SourceConfig } from './types.js';

const log = createLogger('BriefingConfigParser');

const SOCIAL_PLATFORMS: Record<string, SourceConfig['type']> = {
  twitter: 'twitter',
  'x.com': 'twitter',
  tweet: 'twitter',
  instagram: 'instagram',
  insta: 'instagram',
};

export const KNOWN_RSS_FEEDS: Record<string, string> = {
  // German national (verified 2026-03-17)
  'tagesschau.de': 'https://www.tagesschau.de/xml/rss2/',
  'zeit.de': 'https://newsfeed.zeit.de/index',
  'spiegel.de': 'https://www.spiegel.de/schlagzeilen/index.rss',
  'sueddeutsche.de': 'https://rss.sueddeutsche.de/alles',
  'faz.net': 'https://www.faz.net/rss/aktuell/',
  'taz.de': 'https://taz.de/!p4608;rss/',
  'welt.de': 'https://www.welt.de/feeds/latest.rss',
  'n-tv.de': 'https://www.n-tv.de/rss',
  'stern.de': 'https://www.stern.de/feed/standard/all/',
  'focus.de': 'https://www.focus.de/RSS/rss_intern.xml',
  't-online.de': 'https://feeds.t-online.de/rss/nachrichten',
  'handelsblatt.com': 'https://www.handelsblatt.com/contentexport/feed/schlagzeilen',
  'heise.de': 'https://www.heise.de/rss/heise-atom.xml',
  'tagesspiegel.de': 'https://www.tagesspiegel.de/contentexport/feed/berlin',
  'manager-magazin.de': 'https://www.manager-magazin.de/news/index.rss',
  'zdf.de': 'https://www.zdf.de/rss/zdf/nachrichten',
  'deutschlandfunk.de': 'https://www.deutschlandfunk.de/nachrichten-100.rss',
  'dw.com': 'https://rss.dw.com/rdf/rss-de-all',
  'wiwo.de': 'https://www.wiwo.de/contentexport/feed/rss/schlagzeilen',
  'telepolis.de': 'https://www.telepolis.de/news-atom.xml',
  'cicero.de': 'https://www.cicero.de/rss.xml',
  'jacobin.de': 'https://jacobin.de/rss',
  'bild.de': 'https://www.bild.de/rss-feeds/rss-16725492,feed=home.bild.html',
  'berliner-zeitung.de': 'https://www.berliner-zeitung.de/feed.xml',
  'sueddeutsche.de/politik': 'https://rss.sueddeutsche.de/rss/Politik',
  'sueddeutsche.de/wirtschaft': 'https://rss.sueddeutsche.de/rss/Wirtschaft',
  // German public broadcasters (verified 2026-03-19)
  'ndr.de': 'https://www.ndr.de/home/index-rss.xml',
  'mdr.de': 'https://www.mdr.de/nachrichten/index-rss.xml',
  'br.de': 'https://nachrichtenfeeds.br.de/rss/nachrichten/seiten/QXAPkQJ',
  'wdr.de': 'https://www1.wdr.de/uebersicht-100.feed',
  'swr.de': 'https://www.swr.de/~rss/swraktuell-100.xml',
  'hessenschau.de': 'https://www.hessenschau.de/index.rss',
  'rbb24.de': 'https://www.rbb24.de/aktuell/index.xml/feed=rss.xml',
  // German regional (verified)
  'rp-online.de': 'https://rp-online.de/feed.rss',
  'merkur.de': 'https://www.merkur.de/welt/rssfeed.rdf',
  'fr.de': 'https://www.fr.de/rssfeed.rdf',
  'stuttgarter-zeitung.de': 'https://www.stuttgarter-zeitung.de/rss/topthemen.rss.feed',
  'augsburger-allgemeine.de': 'https://www.augsburger-allgemeine.de/rss',
  'hna.de': 'https://www.hna.de/welt/rssfeed.rdf',
  // Austrian (verified)
  'orf.at': 'https://rss.orf.at/news.xml',
  'derstandard.at': 'https://www.derstandard.at/rss',
  'diepresse.com': 'https://www.diepresse.com/rss',
  'kleinezeitung.at': 'https://www.kleinezeitung.at/rss/oesterreich',
  'nachrichten.at': 'https://www.nachrichten.at/storage/rss/rss/nachrichten.xml',
  'tt.com': 'https://www.tt.com/rss/news.xml',
  'news.at': 'https://www.news.at/rss/news',
  'meinbezirk.at': 'https://www.meinbezirk.at/rss',
  'noen.at': 'https://www.noen.at/xml/rss',
  'vienna.at': 'https://www.vienna.at/rss',
  'ots.at': 'https://www.ots.at/rss/index',
  'moment.at': 'https://www.moment.at/rss',
  'kontrast.at': 'https://kontrast.at/feed/',
  'exxpress.at': 'https://exxpress.at/feed/',
  'brandaktuell.at': 'https://www.brandaktuell.at/feed/',
  'krone.at': 'https://www.krone.at/nachrichten/rss.html',
  'kurier.at': 'https://kurier.at/xml/rss',
  'profil.at': 'https://www.profil.at/rss.xml',
  // 'vol.at': feed failed during testing
  // European & specialized (verified)
  'euractiv.de': 'https://www.euractiv.de/feed/',
  'euronews.com': 'https://de.euronews.com/rss',
  'nzz.ch': 'https://www.nzz.ch/recent.rss',
  'correctiv.org': 'https://correctiv.org/feed/',
  'netzpolitik.org': 'https://netzpolitik.org/feed/',
  // Additional (verified 2026-03-19)
  'saechsische.de': 'https://www.saechsische.de/arc/outboundfeeds/rss/',
  'ksta.de': 'https://feed.ksta.de/feed/rss/politik/index.rss',
  'rnd.de': 'https://www.rnd.de/arc/outboundfeeds/rss/',
  'tagesspiegel.de/politik': 'https://www.tagesspiegel.de/contentexport/feed/politik',
  'eurotopics.net': 'https://www.eurotopics.net/export/de/rss-debatten.xml',
  'gruene-bundestag.de/fachtexte': 'https://www.gruene-bundestag.de/fachtexte-rss-feed.xml',
  'gruene-bundestag.de/presse': 'https://www.gruene-bundestag.de/pressemitteilungen-rss-feed.xml',
};

export async function parsePrompt(prompt: string): Promise<BriefingConfig> {
  try {
    const result = await generateText({
      model: getBriefingModel(),
      system: `Du bist ein JSON-Generator. Analysiere die Benutzeranfrage und erstelle eine strukturierte Konfiguration für einen Briefing-Agenten.

Antworte NUR mit validem JSON in diesem Format:
{
  "sources": [
    { "type": "web", "query": "Suchbegriff", "domains": ["example.com"] },
    { "type": "twitter", "username": "benutzername" },
    { "type": "instagram", "username": "benutzername" },
    { "type": "rss", "url": "https://example.com/rss" },
    { "type": "documents", "collection": "berlin" }
  ],
  "language": "de",
  "timeRange": "day",
  "maxResultsPerSource": 15,
  "outputFormat": "summary"
}

Regeln:
- "type" kann sein: "web", "twitter", "instagram", "rss", "documents"
- Wenn ein Grüner Landesverband genannt wird, nutze "documents" mit der passenden "collection": hamburg, berlin, bayern, thueringen, schleswig-holstein, mecklenburg-vorpommern
- Weitere document collections: deutschland, bundestagsfraktion, kommunalwiki, gruene-de, gruene-at, oesterreich, gruenblog, boell-stiftung
- Wenn eine spezifische Website genannt wird, nutze "domains" bei "web" UND füge eine "rss" Quelle hinzu falls bekannt
- Wenn ein Twitter/X Account genannt wird, nutze "twitter" mit "username" (ohne @)
- Wenn ein Instagram Account genannt wird, nutze "instagram" mit "username"
- "timeRange": "day" für tägliche/stündliche Updates, "week" für wöchentliche
- "outputFormat": "summary" (Zusammenfassung), "list" (Auflistung), "digest" (kategorisiert)
- Erstelle sinnvolle Suchbegriffe aus der Beschreibung
- maxResultsPerSource: 10-20 je nach Komplexität`,
      prompt,
      temperature: 0.1,
      maxOutputTokens: 1000,
    });

    const responseText = result.text || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn('AI did not return valid JSON, using heuristic fallback');
      return heuristicParse(prompt);
    }

    const parsed = JSON.parse(jsonMatch[0]) as BriefingConfig;
    return validateConfig(parsed);
  } catch (error) {
    log.error(`AI config parsing failed: ${toError(error).message}, using heuristic`);
    return heuristicParse(prompt);
  }
}

function heuristicParse(prompt: string): BriefingConfig {
  const lower = prompt.toLowerCase();
  const sources: SourceConfig[] = [];

  // Detect social media mentions
  for (const [keyword, type] of Object.entries(SOCIAL_PLATFORMS)) {
    if (lower.includes(keyword)) {
      const usernameMatch = prompt.match(/@(\w+)/);
      if (usernameMatch) {
        sources.push({ type, username: usernameMatch[1] });
      }
    }
  }

  // Detect domain mentions
  const domainMatch = prompt.match(/(?:auf|von|bei|from)\s+([\w.-]+\.(?:de|com|eu|at|org|net))/gi);
  const domains: string[] = [];
  if (domainMatch) {
    for (const match of domainMatch) {
      const domain = match.replace(/^(?:auf|von|bei|from)\s+/i, '').trim();
      domains.push(domain);
      // Add RSS if known
      if (KNOWN_RSS_FEEDS[domain]) {
        sources.push({ type: 'rss', url: KNOWN_RSS_FEEDS[domain] });
      }
    }
  }

  // Extract core topic (remove common German filler words)
  const topic = prompt
    .replace(
      /\b(gib|zeig|fasse|schick|sende|mir|alle|jeden|jede|jedes|tag|täglich|stündlich|zusammen|bitte|von|auf|bei|heute|posts?|artikel|nachrichten|updates?|beiträge?)\b/gi,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();

  if (topic) {
    sources.push({ type: 'web', query: topic, domains });
  }

  // If no sources found, use the whole prompt as a web search
  if (sources.length === 0) {
    sources.push({ type: 'web', query: prompt.slice(0, 200) });
  }

  const timeRange =
    lower.includes('wöchentlich') || lower.includes('weekly') || lower.includes('woche')
      ? 'week'
      : 'day';
  const outputFormat = lower.includes('liste') || lower.includes('list') ? 'list' : 'summary';

  return {
    sources,
    language: 'de',
    timeRange,
    maxResultsPerSource: 15,
    outputFormat,
  };
}

function validateConfig(config: BriefingConfig): BriefingConfig {
  return {
    sources: (config.sources || []).slice(0, 10).map((s) => ({
      type: ['web', 'twitter', 'instagram', 'rss', 'documents', 'scrape'].includes(s.type)
        ? s.type
        : 'web',
      collection: s.collection?.slice(0, 100),
      query: s.query?.slice(0, 500),
      domains: (s.domains || []).slice(0, 5),
      username: s.username?.replace(/^@/, '').slice(0, 50),
      url: s.url?.slice(0, 2000),
      keywords: (s.keywords || []).slice(0, 20).map((k) => k.slice(0, 100)),
      scrapeConfig: s.scrapeConfig,
    })),
    language: config.language || 'de',
    timeRange: config.timeRange === 'week' ? 'week' : 'day',
    maxResultsPerSource: Math.min(Math.max(config.maxResultsPerSource || 15, 1), 50),
    outputFormat: ['summary', 'list', 'digest'].includes(config.outputFormat)
      ? config.outputFormat
      : 'summary',
    customPrompt: config.customPrompt,
    positionCollections: config.positionCollections?.slice(0, 10),
    positionComparisonPrompt: config.positionComparisonPrompt,
  };
}
