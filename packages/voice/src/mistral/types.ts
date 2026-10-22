export type HostedVariant = 'tools' | 'notebook';

export interface HostedSessionOptions {
  variant: HostedVariant;
  notebookId: string | null;
  fastMode: boolean;
}

/** What a creating tool made; its card is a message the server saved in the thread. */
export interface VoiceArtifact {
  kind: string;
  /** Its own title, else the kind's name ("Sharepic"). */
  title: string;
  url: string | null;
  /** That message (as `/messages` lists it), null when saving it failed. */
  messageId: string | null;
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
  sharepic: 'Gestalte das Sharepic',
  create_presentation: 'Baue die Präsentation',
  create_sheet: 'Lege die Tabelle an',
  create_document: 'Schreibe das Dokument',
  create_pdf: 'Setze das PDF',
  create_board: 'Lege das Board an',
  create_explainable: 'Schreibe das Explainable',
};

/**
 * The tools that put a card into the chat — the API's artifact kinds
 * (`loopToolName` in `artifactKindRegistry.ts`). The call steps aside for them
 * so the card can be seen arriving.
 */
export const CREATING_TOOLS: ReadonlySet<string> = new Set([
  'sharepic',
  'create_presentation',
  'create_sheet',
  'create_document',
  'create_pdf',
  'create_board',
  'create_explainable',
]);
