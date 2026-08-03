import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ProtokollTyp } from '../hooks/useProtokoll';
import type { TranscriptionSegment } from '../hooks/useTranscription';

/**
 * The last completed transcription, kept in localStorage.
 *
 * Nothing about a transcription was persisted anywhere: a reload, a stray
 * navigation or a browser crash after a ten-minute job lost the lot, with no
 * history to fall back on. This is the cheap half of the fix — a single
 * recoverable result. The durable half is the explicit "Als Dokument speichern"
 * action, which puts it in collaborative_documents where history, search and
 * sharing already exist.
 *
 * Deliberately one slot, not a list: it exists so a reload isn't fatal, not as
 * an archive. The archive is Docs.
 */
export interface LastTranscription {
  text: string;
  segments: TranscriptionSegment[];
  hasTimestamps: boolean;
  speakerMap: Record<string, string>;
  /** User-corrected speaker labels, layered over the AI-detected `speakerMap`. */
  speakerOverrides: Record<string, string>;
  fileName: string;
  protokoll: string;
  protokollTyp: ProtokollTyp | null;
  /** ISO string — a Date would not survive JSON round-tripping. */
  savedAt: string;
}

interface LastTranscriptionStore {
  last: LastTranscription | null;
  save: (value: LastTranscription) => void;
  patch: (value: Partial<LastTranscription>) => void;
  clear: () => void;
}

export const useLastTranscriptionStore = create<LastTranscriptionStore>()(
  persist(
    (set, get) => ({
      last: null,
      save: (value) => set({ last: value }),
      patch: (value) => {
        const current = get().last;
        if (!current) return;
        set({ last: { ...current, ...value } });
      },
      clear: () => set({ last: null }),
    }),
    {
      // F0: the storage key is a wire format towards already-shipped browsers.
      // Never rename it — bump `version` and migrate instead.
      name: 'gruenerator-transkription',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (persisted, version) => {
        // v0 predates speakerOverrides; default it so the merge below is total.
        if (version === 0) {
          const state = persisted as { last?: LastTranscription | null };
          if (state.last) {
            return { last: { ...state.last, speakerOverrides: state.last.speakerOverrides ?? {} } };
          }
        }
        return persisted as { last: LastTranscription | null };
      },
    }
  )
);
