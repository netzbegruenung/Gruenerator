/**
 * Maps ChatGraph search intents to tool names used in the UI (tool-call parts).
 * Shared across ModelAdapter, ChatProvider, and MobileChatProvider.
 */
export const INTENT_TO_TOOL: Record<string, string> = {
  search: 'gruenerator_search',
  web: 'web_search',
  // Research is the same web retrieval at a deeper tier since the merge — it
  // returns a result list, not the written report the `research` renderer
  // (`markdown-report`) expects, which would render an empty card over a good
  // answer. Threads from before the merge carry their own persisted `research`
  // tool call and keep the Recherche-Karte; only this live intent→tool hop moves.
  research: 'web_search',
  examples: 'gruenerator_examples_search',
  pressemitteilung_examples: 'gruenerator_pressemitteilung_examples',
  chat_history: 'search_chat_history',
  hilfe: 'gruenerator_docs_search',
  bundestag: 'bundestag',
};

/** System MCP source prefixes → display names (mirrors apps/api systemMcpServers). */
const SYSTEM_TOOL_PREFIXES: Record<string, string> = {
  bahn: 'Deutsche Bahn',
  wetter: 'Wetter (DWD)',
  news: 'tagesschau',
  hotel: 'trivago',
};

/**
 * Human-readable label for an agentic-loop tool step. MCP/connector tools are
 * namespaced `s<idx>__<tool>` (user connectors) or `<source>__<tool>` (system
 * sources) on the wire; strip the prefix and prepend the server name so the
 * card reads e.g. "Notion · search" / "Deutsche Bahn · get_planned_timetable"
 * — identical live and after a thread reload (persisted steps carry no
 * serverName). Internal tools pass through unchanged.
 */
export function formatNamespacedToolLabel(toolName: string, serverName?: string): string {
  const match = /^s\d+__(.+)$/.exec(toolName);
  if (match) return serverName ? `${serverName} · ${match[1]}` : (match[1] ?? toolName);
  const system = /^([a-z]+)__(.+)$/.exec(toolName);
  const systemName = system?.[1] ? SYSTEM_TOOL_PREFIXES[system[1]] : undefined;
  if (system && systemName) return `${serverName ?? systemName} · ${system[2]}`;
  return serverName ? `${serverName} · ${toolName}` : toolName;
}

/** Singular/plural German label per tool for the collapsed tool-run summary row. */
const TOOL_COUNT_LABELS: Record<string, readonly [singular: string, plural: string]> = {
  gruenerator_search: ['Suche', 'Suchen'],
  web_search: ['Suche', 'Suchen'],
  research: ['Suche', 'Suchen'],
  scrape_url: ['Webseite gelesen', 'Webseiten gelesen'],
  sharepic: ['Sharepic', 'Sharepics'],
  generate_image: ['Bild', 'Bilder'],
  create_presentation: ['Präsentation', 'Präsentationen'],
  create_sheet: ['Tabelle', 'Tabellen'],
  create_document: ['Dokument', 'Dokumente'],
  save_as_doc: ['Dokument', 'Dokumente'],
};

/**
 * Summary label for N calls of one tool in a collapsed tool-run row, e.g.
 * "4 Suchen" or "1 Sharepic". MCP/namespaced tools route through
 * `formatNamespacedToolLabel` for their display name; anything unregistered
 * falls back to the raw tool name with a `×N` counter.
 */
export function toolCountLabel(toolName: string, count: number): string {
  const pair = TOOL_COUNT_LABELS[toolName];
  if (pair) return `${count} ${count === 1 ? pair[0] : pair[1]}`;

  const namespaced = formatNamespacedToolLabel(toolName);
  if (namespaced !== toolName) return `${namespaced} ×${count}`;

  return `${toolName} ×${count}`;
}

/**
 * Maps backend tool names (from thinking_step events) to UI-facing tool names.
 */
export const DEEP_TOOL_MAP: Record<string, string> = {
  search_documents: 'gruenerator_search',
  web_search: 'web_search',
  research: 'research',
  search_examples: 'gruenerator_examples_search',
  generate_image: 'generate_image',
  scrape_url: 'scrape_url',
  recall_memory: 'recall_memory',
  save_memory: 'save_memory',
  search_user_content: 'search_user_content',
};
