import { Mistral } from '@mistralai/mistralai';

import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import type { BriefingConfig, SourceConfig } from './types.js';

const log = createLogger('BriefingConfigParser');

let mistralClient: Mistral | null = null;

function getMistralClient(): Mistral {
  if (!mistralClient) {
    mistralClient = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  }
  return mistralClient;
}

const SOCIAL_PLATFORMS: Record<string, SourceConfig['type']> = {
  twitter: 'twitter',
  'x.com': 'twitter',
  tweet: 'twitter',
  instagram: 'instagram',
  insta: 'instagram',
};

const KNOWN_RSS_FEEDS: Record<string, string> = {
  'tagesschau.de': 'https://www.tagesschau.de/index~rss2.xml',
  'zeit.de': 'https://newsfeed.zeit.de/index',
  'spiegel.de': 'https://www.spiegel.de/schlagzeilen/index.rss',
  'sueddeutsche.de': 'https://rss.sueddeutsche.de/alles',
  'faz.net': 'https://www.faz.net/rss/aktuell/',
  'taz.de': 'https://taz.de/!p4608;rss/',
};

export async function parsePrompt(prompt: string): Promise<BriefingConfig> {
  try {
    const result = await getMistralClient().chat.complete({
      model: 'mistral-small-latest',
      messages: [
        {
          role: 'system',
          content: `Du bist ein JSON-Generator. Analysiere die Benutzeranfrage und erstelle eine strukturierte Konfiguration für einen Briefing-Agenten.

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
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      maxTokens: 1000,
      responseFormat: { type: 'json_object' },
    });

    const responseText =
      typeof result.choices?.[0]?.message?.content === 'string'
        ? result.choices[0].message.content
        : '';
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
      type: ['web', 'twitter', 'instagram', 'rss', 'documents'].includes(s.type) ? s.type : 'web',
      collection: s.collection?.slice(0, 100),
      query: s.query?.slice(0, 500),
      domains: (s.domains || []).slice(0, 5),
      username: s.username?.replace(/^@/, '').slice(0, 50),
      url: s.url?.slice(0, 2000),
    })),
    language: config.language || 'de',
    timeRange: config.timeRange === 'week' ? 'week' : 'day',
    maxResultsPerSource: Math.min(Math.max(config.maxResultsPerSource || 15, 1), 50),
    outputFormat: ['summary', 'list', 'digest'].includes(config.outputFormat)
      ? config.outputFormat
      : 'summary',
  };
}
