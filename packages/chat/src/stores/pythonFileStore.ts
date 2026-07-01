import { create } from 'zustand';

import { type PythonFile } from './chatConfigStore';

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
