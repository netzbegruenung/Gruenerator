/**
 * Maps ChatGraph search intents to tool names used in the UI (tool-call parts).
 * Shared across ModelAdapter, ChatProvider, and MobileChatProvider.
 */
export const INTENT_TO_TOOL: Record<string, string> = {
  search: 'gruenerator_search',
  web: 'web_search',
  research: 'research',
  examples: 'gruenerator_examples_search',
  pressemitteilung_examples: 'gruenerator_pressemitteilung_examples',
  chat_history: 'search_chat_history',
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
