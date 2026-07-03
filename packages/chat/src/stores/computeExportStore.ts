import { create } from 'zustand';

/**
 * Session-scoped stash of the files the in-browser Python interpreter wrote
 * (CSV exports etc.), keyed by file name. The compute card's download chips
 * prefer these local bytes over the server asset URL — the browser literally
 * just produced the file, so a fresh export must never depend on the server
 * round-trip (asset storage, auth mode, retention). The URL path remains the
 * fallback for reloaded threads, where this stash is empty.
 *
 * Cleared on thread switch together with the interpreter's input-file store.
 */
interface ComputeExportState {
  files: Record<string, string>; // file name → base64
  stash: (files: Array<{ name: string; base64: string }>) => void;
  clear: () => void;
}

export const useComputeExportStore = create<ComputeExportState>((set) => ({
  files: {},
  stash: (files) =>
    set((state) => ({
      files: {
        ...state.files,
        ...Object.fromEntries(files.map((f) => [f.name, f.base64])),
      },
    })),
  clear: () => set({ files: {} }),
}));
