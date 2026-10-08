import { createContext, useContext } from 'react';

/**
 * Identifies the collaborative canvas document the editor is bound to, for
 * the in-editor chat (per-document thread + edit-trigger routing). Null in
 * the non-collab template flow (/studio/templates/:type), where the chat
 * falls back to a session thread and a synthetic document key.
 */
export interface CanvasChatDoc {
  documentId: string;
  title: string | null;
}

export const CanvasChatDocContext = createContext<CanvasChatDoc | null>(null);

export function useCanvasChatDoc(): CanvasChatDoc | null {
  return useContext(CanvasChatDocContext);
}

/**
 * Synthetic document key of the template flow's chat, owned above the editor
 * so it survives remounts of the chat section (#4273). A per-mount key would
 * route a running turn's editor operations to nobody.
 */
export const CanvasChatDraftIdContext = createContext<string | null>(null);

export function useCanvasChatDraftId(): string | null {
  return useContext(CanvasChatDraftIdContext);
}
