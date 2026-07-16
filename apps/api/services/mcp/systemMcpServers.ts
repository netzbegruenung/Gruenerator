/**
 * First-party system MCP sources (EXPERIMENTAL) — built-in chat search
 * capabilities (Deutsche Bahn timetables, Open-Meteo/DWD weather, ARD/
 * Tagesschau news), operated as Grünerator infrastructure and consumed
 * server-side like the bundestag tool family. NOT user-managed connectors:
 * no `mcp_servers` row, no settings UI, no @mention.
 *
 * Each source is active only when its URL env var is set — the endpoint lives
 * exclusively in deploy env (never in the repo or any API response), and
 * unsetting the var is the kill switch. Auth: optional shared bearer via the
 * matching `…_TOKEN` env; without it the source connects unauthenticated.
 */

import { type SearchIntent } from '@gruenerator/contracts';

import { type McpConnectionConfig } from './UserMCPClient.js';

export type SystemMcpKey = 'bahn' | 'wetter' | 'news' | 'hotel';

export interface SystemMcpSource {
  /** Also the intent + tool-name prefix (`bahn__<tool>`), stable across turns. */
  key: SystemMcpKey;
  /** User-visible label on tool cards ("Deutsche Bahn · get_planned_timetable…"). */
  name: string;
  url: string;
  authType: McpConnectionConfig['authType'];
  token: string | null;
  /** One German line for the loop's capability block. */
  capability: string;
  /**
   * Tool-usage + answer-format instructions appended to the loop's system
   * prompt when this source is mounted. `{{TODAY_ISO}}` / `{{TODAY_YYMMDD}}`
   * are replaced at mount time.
   */
  promptHint: string;
  /**
   * Server tools to mount; null = all. Open-Meteo exposes 17 tools with very
   * large enum schemas (per-vendor model variants) — the allowlist keeps the
   * per-turn token cost sane while covering every everyday weather question.
   */
  toolAllowlist: string[] | null;
}

const ENV_BY_KEY: Record<SystemMcpKey, { url: string; token: string }> = {
  bahn: { url: 'SYSTEM_MCP_DB_URL', token: 'SYSTEM_MCP_DB_TOKEN' },
  wetter: { url: 'SYSTEM_MCP_WEATHER_URL', token: 'SYSTEM_MCP_WEATHER_TOKEN' },
  news: { url: 'SYSTEM_MCP_ARD_URL', token: 'SYSTEM_MCP_ARD_TOKEN' },
  hotel: { url: 'SYSTEM_MCP_TRIVAGO_URL', token: 'SYSTEM_MCP_TRIVAGO_TOKEN' },
};

/**
 * Which sources a system intent mounts. `bahn`/`wetter`/`news` are the pure
 * single-source intents; `reise` is the umbrella travel intent mounting train
 * timetables + hotel search + destination weather in ONE loop turn, so "plane
 * meine Fahrt zum Länderrat: Zug und Hotel" needs no intent split.
 */
const INTENT_SOURCES: Record<string, SystemMcpKey[]> = {
  bahn: ['bahn'],
  reise: ['bahn', 'hotel', 'wetter'],
  wetter: ['wetter'],
  news: ['news'],
};

const DEFINITIONS: Array<Omit<SystemMcpSource, 'url' | 'authType' | 'token'>> = [
  {
    key: 'bahn',
    name: 'Deutsche Bahn',
    capability:
      'Deutsche Bahn: Bahnhöfe suchen, Abfahrts-/Ankunftspläne (Soll + Störungen) und Bahnhofsausstattung abfragen.',
    promptHint: [
      'BAHN-AUSKUNFT: Heute ist {{TODAY_ISO}}. Vorgehen: 1) bahn__get_station_by_name → eva_number des Bahnhofs; 2) bahn__get_planned_timetable mit date im Format YYMMDD (heute: {{TODAY_YYMMDD}}) und hour als zweistelliger Stunde; 3) bei Bedarf bahn__get_full_timetable_changes für Verspätungen/Ausfälle.',
      'Für "von X nach Y": Abfahrten in X abrufen und Züge wählen, deren Fahrtverlauf (via/destination) Richtung Y führt; es gibt KEINE Verbindungssuche mit Umstiegen oder Preisen — biete das auch nicht an.',
      'Antworte mit einer kompakten Markdown-Tabelle (Zeit, Zug, Richtung, Gleis), maximal die relevantesten Züge. Fehlt der Startbahnhof, stelle EINE kurze Rückfrage; fehlt nur die Zeit, nimm "jetzt" an. Erfinde NIE Zeiten oder Züge — wenn der Dienst nicht antwortet, sag das ehrlich.',
    ].join(' '),
    toolAllowlist: null,
  },
  {
    key: 'wetter',
    name: 'Wetter (DWD)',
    capability:
      'Wetter: Vorhersagen (Open-Meteo/DWD ICON), aktuelles Wetter, Luftqualität und historische Wetterdaten — Orte zuerst per geocoding auflösen.',
    promptHint:
      'WETTER-AUSKUNFT: Heute ist {{TODAY_ISO}}. Vorgehen: 1) wetter__geocoding für die Koordinaten des Orts; 2) wetter__weather_forecast (hourly/daily Variablen wie temperature_2m, precipitation_probability, weather_code gezielt anfordern). Antworte mit einer kurzen Zusammenfassung (heute/morgen, Temperatur, Regenwahrscheinlichkeit) statt Zahlenkolonnen. Erfinde keine Vorhersagen — wenn der Dienst nicht antwortet, sag das ehrlich.',
    toolAllowlist: [
      'geocoding',
      'weather_forecast',
      'dwd_icon_forecast',
      'air_quality',
      'weather_archive',
    ],
  },
  {
    key: 'news',
    name: 'tagesschau',
    capability:
      'Nachrichten: aktuelle tagesschau-Meldungen (gesamt, nach Ressort oder Bundesland) und Artikelsuche.',
    promptHint:
      'NACHRICHTEN: Nutze news__search_news (Thema), news__get_news_by_ressort (inland/ausland/wirtschaft/…) oder news__get_regional_news (Bundesland-ID). Ergebnisse sind nach Datum sortiert, nicht nach Relevanz. Belege Aussagen mit den nummerierten Quellen als [N]-Marker.',
    toolAllowlist: null,
  },
  {
    key: 'hotel',
    name: 'trivago',
    capability: 'Hotels: Unterkünfte per trivago suchen und Preise vergleichen.',
    promptHint:
      'HOTEL-SUCHE: Nutze hotel__trivago-accommodation-search (Zielort/POI) mit arrival/departure im Format YYYY-MM-DD, adults und country "DE". Antworte mit den besten 2-3 Unterkünften (Name, Preis, Bewertung) und nenne trivago als Quelle; Preise sind Vergleichspreise ohne Gewähr. Erfinde keine Unterkünfte oder Preise.',
    toolAllowlist: null,
  },
];

/**
 * The env-active system sources, resolved at call time (cheap; keeps tests
 * hermetic — set `process.env` before calling).
 */
export function getSystemMcpSources(): SystemMcpSource[] {
  const sources: SystemMcpSource[] = [];
  for (const def of DEFINITIONS) {
    const env = ENV_BY_KEY[def.key];
    const url = process.env[env.url];
    if (!url) continue;
    const token = process.env[env.token] || null;
    sources.push({ ...def, url, authType: token ? 'bearer' : 'none', token });
  }
  return sources;
}

export function getSystemMcpSource(key: SystemMcpKey): SystemMcpSource | null {
  return getSystemMcpSources().find((s) => s.key === key) ?? null;
}

export const SYSTEM_MCP_INTENTS: ReadonlySet<SearchIntent> = new Set([
  'bahn',
  'reise',
  'wetter',
  'news',
] as SearchIntent[]);

/** The env-configured sources the given system intent mounts (possibly []). */
export function getSourcesForIntent(intent: string): SystemMcpSource[] {
  const keys = INTENT_SOURCES[intent];
  if (!keys) return [];
  const active = getSystemMcpSources();
  return keys.flatMap((k) => active.filter((s) => s.key === k));
}

/** True when the intent has at least one configured system source behind it. */
export function isSystemIntentAvailable(intent: string): boolean {
  return getSourcesForIntent(intent).length > 0;
}

export function toSystemConnectionConfig(source: SystemMcpSource): McpConnectionConfig {
  return {
    id: `system-${source.key}`,
    name: source.name,
    url: source.url,
    authType: source.authType,
    token: source.token,
  };
}
