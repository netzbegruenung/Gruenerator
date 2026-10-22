export type HostedVariant = 'tools' | 'notebook';

export interface HostedSessionOptions {
  variant: HostedVariant;
  notebookId: string | null;
  fastMode: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  /** Name, arguments and run time, for a debug line. */
  label: string;
}

/**
 * One call to our API under `/api/voice/agent-session` (the path passed is
 * relative to it). Resolves with the JSON body, rejects on a non-2xx status.
 * Injected because web (cookie) and mobile (bearer) authenticate differently.
 */
export type AgentSessionRequest = (
  path: string,
  init: { method: 'POST' | 'DELETE'; body?: unknown }
) => Promise<unknown>;

/** What the orb says while the agent runs one of our tools. */
export const TOOL_LABEL: Record<string, string> = {
  notebook_fragen: 'Suche im Notebook',
  notebook_quellen: 'Lese die Quellen',
  gruenerator_search: 'Durchsuche Programme und Beschlüsse',
  web_search: 'Suche im Netz',
  bundestag: 'Frage beim Bundestag nach',
  abgeordnetenwatch: 'Schaue bei Abgeordnetenwatch',
  umfragen: 'Schaue mir die Umfragen an',
};
