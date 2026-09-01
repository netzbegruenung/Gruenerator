/**
 * Maps ChatGraph search intents to tool names used in the UI (tool-call parts).
 * Shared across ModelAdapter, ChatProvider, and MobileChatProvider.
 */
import { intentToolNames } from '@gruenerator/shared/chat-intents';

/**
 * The retrieval intents that render a tool card LIVE, derived from the intent
 * registry's `uiTool` field. The backend's persistence map
 * (`apps/api/routes/chat/services/postResponseService.ts`) derives from the same
 * registry — they MUST agree, or a thread renders one card while streaming and
 * a different one after reload.
 *
 * `hilfe` deliberately has no entry. It used to sit here as a client-only
 * extra, mapped to `gruenerator_docs_search`. That was not an asymmetry worth
 * persisting, it was a GHOST card: this map is consulted only on the
 * non-agentic path (`agentic ? undefined : INTENT_TO_TOOL[intent]`,
 * parseSSEStream), and on that path the docs tool does not exist at all —
 * CHITCHAT_RE pins "hilfe" / "was kannst du" to single-pass, where respondNode
 * injects a documentation PAGE MAP into the prompt instead of retrieving
 * anything. So the card announced a search that never ran, and then vanished on
 * reload because there was correctly nothing to persist. On the agentic path
 * the real `gruenerator_docs_search` step is emitted and persisted by the loop,
 * which is why help answers have working cards there and always did.
 */
export const INTENT_TO_TOOL: Record<string, string> = intentToolNames().ui;

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
  // `m<serverKey>__` ist die heutige Form (serverKey = die ersten 8 Zeichen der
  // mcp_servers.id, also Hex); `s<idx>__` war die frühere und steht noch in
  // älteren Threads.
  const match = /^(?:s\d+|m[0-9a-f]{4,8})__(.+)$/.exec(toolName);
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
  rezept_laden: ['Rezept geladen', 'Rezepte geladen'],
  create_pdf: ['PDF', 'PDFs'],
  create_board: ['Board', 'Boards'],
  umfragen: ['Umfrage', 'Umfragen'],
  memory: ['Erinnerung', 'Erinnerungen'],
  notebooks: ['Notebook-Zugriff', 'Notebook-Zugriffe'],
  groups: ['Projekt-Zugriff', 'Projekt-Zugriffe'],
  recurring_tasks: ['Aufgaben-Zugriff', 'Aufgaben-Zugriffe'],
  user_agents: ['Agenten-Zugriff', 'Agenten-Zugriffe'],
  recipes: ['Rezept-Zugriff', 'Rezept-Zugriffe'],
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

/**
 * Verdicts whose work IS the artifact. Without them these turns fell through to
 * the `searching` default and narrated "Durchsuche …" for the entire generation
 * — three minutes on 02.08.2026, on a turn that had been explicitly forbidden to
 * search. The status line thereby accused the product of ignoring an instruction
 * it had in fact obeyed: the backend never mounted a search tool that turn.
 */
export const ARTIFACT_STAGE_INTENTS: ReadonlySet<string> = new Set([
  'create_pdf',
  'create_presentation',
  'create_sheet',
  'create_board',
  'save_as_doc',
]);

/**
 * The same idea on the tool side, and needed as well as the intent set rather
 * than instead of it: a low-confidence turn is DEMOTED to `agentic` (which does
 * retrieve, so its default stage is right at first) and only reveals itself as a
 * generation turn when the loop's model reaches for the tool. That was the
 * actual path of the 02.08.2026 PDF turn — heuristic `produktion@0.82`, demoted,
 * then `create_pdf`.
 */
export const ARTIFACT_TOOL_NAMES: ReadonlySet<string> = new Set([
  'create_pdf',
  'create_presentation',
  'create_sheet',
  'create_document',
  'create_board',
]);
