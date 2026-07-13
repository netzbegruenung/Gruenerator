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
};

/**
 * Human-readable label for an agentic-loop tool step. MCP/connector tools are
 * namespaced `s<idx>__<tool>` on the wire; strip the prefix and prepend the
 * server name so the card reads e.g. "Notion · search". Internal tools pass
 * through unchanged.
 */
export function formatNamespacedToolLabel(toolName: string, serverName?: string): string {
  const match = /^s\d+__(.+)$/.exec(toolName);
  const bare = match ? match[1] : toolName;
  return serverName ? `${serverName} · ${bare}` : bare;
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
