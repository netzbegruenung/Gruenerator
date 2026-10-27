import { create } from 'zustand';

import { type PythonFile } from './chatConfigStore';

import type { ChatApiClient } from '../context/ChatContext';

/**
 * Session-scoped store of tabular files (CSV/Excel) the user attached in the
 * composer, so the in-browser Python interpreter's Run button can hand them to
 * `runPython(code, files)`. Composer attachments otherwise only travel to the
 * backend/model — this is the bridge that also makes their bytes available to
 * the local Pyodide worker.
 *
 * Keyed by file name so re-attaching the same file replaces (not duplicates) it.
 * Cleared on thread switch (the interpreter's worker/FS is per session too).
 */
interface PythonFileState {
  files: PythonFile[];
  setFile: (file: PythonFile) => void;
  clear: () => void;
}

export const usePythonFileStore = create<PythonFileState>((set) => ({
  files: [],
  setFile: (file) =>
    set((state) => ({
      files: [...state.files.filter((f) => f.name !== file.name), file],
    })),
  clear: () => set({ files: [] }),
}));

/** Decode raw base64 (no data-URL prefix) to an ArrayBuffer for the Pyodide worker. */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * A thread's persisted spreadsheets (`chat_thread_attachments.file_data`), the
 * only way back into this store after a thread switch cleared it. The server
 * writes them when a turn suspends and again when it ends.
 */
export async function fetchThreadTabularFiles(
  apiClient: ChatApiClient,
  threadId: string
): Promise<PythonFile[]> {
  const tabular = await apiClient.get<{
    files: Array<{ name: string; mimeType: string; data: string }>;
  }>(`/api/chat-service/threads/${threadId}/tabular-files`);
  return tabular.files.map((f) => ({
    name: f.name,
    mimeType: f.mimeType,
    bytes: base64ToArrayBuffer(f.data),
  }));
}
