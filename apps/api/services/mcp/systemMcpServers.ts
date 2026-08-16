/**
 * First-party system MCP sources (EXPERIMENTAL) — built-in chat search
 * capabilities (Deutsche Bahn timetables, Open-Meteo/DWD weather, ARD/
 * Tagesschau news), operated as Grünerator infrastructure and consumed
 * server-side like the bundestag tool family.
 *
 * Each source is active only when its URL env var is set — the endpoint lives
 * exclusively in deploy env (never in the repo or any API response), and
 * unsetting the var is the kill switch. Auth: optional shared bearer via the
 * matching `…_TOKEN` env; without it the source connects unauthenticated.
 *
 * TWO VIEWS OF THE SAME SOURCE. Historically these were intent-only: no
 * `mcp_servers` row, no settings UI, no @mention. A source can now ALSO be a
 * MANAGED CONNECTOR — listed in Einstellungen → Verbindungen for every user,
 * enabled by default, mountable via `@mention` — without gaining a per-user row
 * (see `MANAGED_KEYS` + `getManagedConnectors`). The connector view is the
 * target state for all of them; the intent view is what is being dismantled.
 * Both views read the SAME definition, so a source can never describe itself
 * differently in the two places.
 */

import { type SearchIntent } from '@gruenerator/contracts';

import { type McpConnectionConfig } from './UserMCPClient.js';

export type SystemMcpKey = 'bahn' | 'wetter' | 'news' | 'hotel' | 'gesetze';

/**
 * Presentation for the MANAGED-CONNECTOR view — settings row, derived
 * `@mention`, connector card.
 */
export interface SystemMcpConnectorInfo {
  /** Connector name. Also the @mention slug via `slugifyName` — keep it short. */
  title: string;
  /** One sentence for the settings row and the mention hint. */
  description: string;
  /** Grouping pill in the connector directory (matches McpRegistryService). */
  category: string;
}

export interface SystemMcpSource {
  /** Also the intent + tool-name prefix (`bahn__<tool>`), stable across turns. */
  key: SystemMcpKey;
  /** User-visible label on tool cards ("Deutsche Bahn · get_planned_timetable…"). */
  name: string;
  /** Managed-connector presentation (settings, @mention). */
  connector: SystemMcpConnectorInfo;
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
  gesetze: { url: 'SYSTEM_MCP_LAW_URL', token: 'SYSTEM_MCP_LAW_TOKEN' },
};

/**
 * The sources exposed as MANAGED CONNECTORS — listed in the settings, enabled
 * for every user by default, mountable via `@mention` and by the vocabulary
 * trigger (`managedSourceTrigger.ts`).
 *
 * All of them, now. Four arrived here from the intent side, where each owned an
 * enum value, a classifier branch, a `searchNode` case and a share of a 900-ms
 * LLM resolver. What they needed from all that was "mount these tools" — which
 * is what a connector is.
 *
 * Order is the mount order the trigger reports and the settings list shows.
 */
const MANAGED_KEYS: readonly SystemMcpKey[] = ['bahn', 'hotel', 'wetter', 'news', 'gesetze'];

/**
 * Synthetic connector id. Shares the `system-<key>` shape with
 * {@link toSystemConnectionConfig} so ONE id identifies a source everywhere:
 * `@mention` target, `mcp:<id>` scope, and the tool-name prefix mcpCatalog
 * derives (`config.id.replace(/-/g,'').slice(0,8)` → `systemge`).
 *
 * A user's own servers are UUIDs and can never collide with this prefix.
 */
export const MANAGED_ID_PREFIX = 'system-';

export function managedConnectorId(key: SystemMcpKey): string {
  return `${MANAGED_ID_PREFIX}${key}`;
}

/** `system-gesetze` → `gesetze`; anything else (incl. a user UUID) → null. */
export function parseManagedConnectorId(id: string): SystemMcpKey | null {
  if (!id.startsWith(MANAGED_ID_PREFIX)) return null;
  const key = id.slice(MANAGED_ID_PREFIX.length);
  return key in ENV_BY_KEY ? (key as SystemMcpKey) : null;
}

/** True when the source is surfaced as a managed connector. */
export function isManagedKey(key: SystemMcpKey): boolean {
  return MANAGED_KEYS.includes(key);
}

/**
 * Audience per SOURCE.
 *
 * This used to sit next to an intent→sources map and carry a long note about
 * why the per-source grain mattered: `reise` mounted three sources at once, and
 * an intent-level audience could only have dropped the whole intent for Austria
 * or kept the wrong tools. That is why `reise` was switched off.
 *
 * The grain is now the only grain there is — connectors are selected
 * individually, so an Austrian travel turn simply keeps hotel and weather and
 * loses the train tools. The umbrella problem dissolved with the umbrella.
 *
 * Deutsche Bahn has no ÖBB counterpart wired up, tagesschau covers Austria as
 * foreign news, and the law corpus is German federal law. Weather (Open-Meteo)
 * and hotels (trivago) are global.
 */
const SOURCE_AUDIENCE: Record<SystemMcpKey, 'de-DE' | 'all'> = {
  bahn: 'de-DE',
  news: 'de-DE',
  wetter: 'all',
  hotel: 'all',
  // German federal law only (QuantLaw/gesetze-im-internet snapshot). Austrian
  // law is a different corpus, not a translation of this one.
  gesetze: 'de-DE',
};

const DEFINITIONS: Array<Omit<SystemMcpSource, 'url' | 'authType' | 'token'>> = [
  {
    key: 'bahn',
    name: 'Deutsche Bahn',
    connector: {
      title: 'Deutsche Bahn',
      description: 'Bahnhöfe, Abfahrtspläne und Störungsmeldungen der Deutschen Bahn.',
      category: 'Reise & Verkehr',
    },
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
    connector: {
      title: 'Wetter',
      description: 'Wettervorhersage, aktuelles Wetter und Luftqualität (Open-Meteo/DWD).',
      category: 'Wetter & Umwelt',
    },
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
    connector: {
      title: 'tagesschau',
      description: 'Aktuelle tagesschau-Meldungen nach Thema, Ressort oder Bundesland.',
      category: 'Nachrichten',
    },
    capability:
      'Nachrichten: aktuelle tagesschau-Meldungen (gesamt, nach Ressort oder Bundesland) und Artikelsuche.',
    promptHint:
      'NACHRICHTEN: Nutze news__search_news (Thema), news__get_news_by_ressort (inland/ausland/wirtschaft/…) oder news__get_regional_news (Bundesland-ID). Ergebnisse sind nach Datum sortiert, nicht nach Relevanz. Belege Aussagen mit den nummerierten Quellen als [N]-Marker.',
    toolAllowlist: null,
  },
  {
    key: 'hotel',
    name: 'trivago',
    connector: {
      title: 'trivago',
      description: 'Unterkünfte suchen und Preise vergleichen.',
      category: 'Reise & Verkehr',
    },
    capability: 'Hotels: Unterkünfte per trivago suchen und Preise vergleichen.',
    promptHint:
      'HOTEL-SUCHE: Nutze hotel__trivago-accommodation-search (Zielort/POI) mit arrival/departure im Format YYYY-MM-DD, adults und country "{{COUNTRY}}". Antworte mit den besten 2-3 Unterkünften (Name, Preis, Bewertung) und nenne trivago als Quelle; Preise sind Vergleichspreise ohne Gewähr. Erfinde keine Unterkünfte oder Preise.',
    toolAllowlist: null,
  },
  {
    key: 'gesetze',
    name: 'Gesetze',
    connector: {
      title: 'Gesetze',
      description: 'Deutsches Bundesrecht durchsuchen, Normen im Volltext lesen und Zitate prüfen.',
      category: 'Recht & Compliance',
    },
    capability:
      'Gesetze: deutsches Bundesrecht im Volltext durchsuchen, einzelne Normen abrufen und Zitate gegen den Bestand prüfen.',
    promptHint: [
      'GESETZES-AUSKUNFT: 1) gesetze__search_legislation mit dem Rechtsbegriff ODER dem Zitat ("§ 823 BGB", "Art. 14 GG"); 2) gesetze__get_provision für den Volltext einer Norm ({law, article} oder die id aus dem Suchtreffer).',
      'Behauptete Zitate IMMER mit gesetze__validate_citation prüfen, bevor du sie wiedergibst — der Dienst existiert genau dafür. gesetze__check_currency sagt, ob eine Norm im importierten Bestand noch gilt.',
      'Zitiere Norm und Fassung wörtlich und nenne die Quell-URL aus dem Ergebnis. Der Bestand ist ein datierter Snapshot und kann der amtlichen Fassung um Tage hinterherhängen: Sag das dazu, wenn es auf die aktuelle Fassung ankommt. Das ist KEINE Rechtsberatung — weise darauf hin, wenn jemand eine rechtliche Bewertung erwartet. Erfinde niemals Paragrafen, Absätze oder Fundstellen.',
    ].join(' '),
    // 4 von 8: parse_citation/format_citation sind reine String-Umformer, die
    // das Modell selbst beherrscht, list_sources/about beschreiben den Server.
    // Der Rest ist das, was Daten liefert — und was in jedem Turn im Katalog
    // liegen soll, muss klein sein (~1.250 statt ~2.100 Token).
    toolAllowlist: ['search_legislation', 'get_provision', 'validate_citation', 'check_currency'],
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

/**
 * Every intent that ONLY the agentic loop can execute. Single source for the
 * router's loop-forcing gate and the internal-first search exemption.
 * `executeIntentPipeline` has no branch for either, so an intent listed here
 * MUST reach the loop.
 *
 * Down to the two NATIVE domain tools. `bahn`/`reise`/`hotel`/`wetter`/`news`
 * were the other five and are gone from the intent axis entirely — they are
 * managed connectors now, selected by vocabulary rather than by a verdict, and
 * they no longer need an intent to force the loop (`managedSourceKeys` does
 * that). The enum VALUES stay in `searchIntentSchema` (F0: shipped clients parse
 * them), they are simply never produced.
 */
export const SYSTEM_TOOL_INTENTS: ReadonlySet<SearchIntent> = new Set([
  'umfragen',
  'hilfe',
] as const satisfies readonly SearchIntent[]);

/**
 * True when this SOURCE's data only covers Germany.
 *
 * There used to be a second, intent-shaped answer to the same question
 * (`DE_ONLY_SYSTEM_INTENTS`), and the two were interchangeable only because
 * every source key happened to also be an intent name. With the intents gone
 * this is the single form.
 */
export function isSourceGermanOnly(key: SystemMcpKey): boolean {
  return SOURCE_AUDIENCE[key] === 'de-DE';
}

export function toSystemConnectionConfig(source: SystemMcpSource): McpConnectionConfig {
  return {
    id: managedConnectorId(source.key),
    name: source.name,
    url: source.url,
    authType: source.authType,
    token: source.token,
    managed: true,
  };
}

// ── Managed-connector view ───────────────────────────────────────────────────

/** An env-active source presented as a connector (synthetic id, no DB row). */
export interface ManagedConnector extends SystemMcpSource {
  /** `system-<key>` — the @mention target and `mcp:<id>` scope. */
  id: string;
}

/**
 * The managed connectors this deployment offers, in `MANAGED_KEYS` order.
 *
 * Env-gated exactly like the intent view: a key without its `…_URL` set is
 * absent, which stays the kill switch AND the reason an unfinished source (no
 * shared token yet) is invisible rather than listed-but-broken.
 *
 * `locale` drops connectors whose data does not cover that country. It is
 * OPTIONAL and deliberately not applied on the explicit-mention path: a user who
 * types `@bahn` asked for that server, whatever their country. Automatic
 * mounting is where the audience gate belongs.
 */
export function getManagedConnectors(locale?: string | null): ManagedConnector[] {
  const active = getSystemMcpSources();
  const connectors: ManagedConnector[] = [];
  for (const key of MANAGED_KEYS) {
    if (locale && SOURCE_AUDIENCE[key] !== 'all' && SOURCE_AUDIENCE[key] !== locale) continue;
    const source = active.find((s) => s.key === key);
    if (source) connectors.push({ ...source, id: managedConnectorId(key) });
  }
  return connectors;
}

/** One managed connector by its synthetic id, or null if unknown/not configured. */
export function getManagedConnectorById(id: string): ManagedConnector | null {
  const key = parseManagedConnectorId(id);
  if (!key) return null;
  return getManagedConnectors().find((c) => c.key === key) ?? null;
}
