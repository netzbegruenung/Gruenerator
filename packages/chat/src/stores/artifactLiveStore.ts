import { create } from 'zustand';

import { useReelLiveStore } from './reelLiveStore';
import { useSharepicLiveStore } from './sharepicLiveStore';

import type { ArtifactData } from '../hooks/useChatGraphStream';

/**
 * Live state of the generic artifact (HTML/SVG) the user is viewing in the
 * docked side panel. Written by the SSE parser (`artifact` event) and by inline
 * artifact cards when the user re-opens one; read by ArtifactPanel.
 *
 * Modeled on sharepicLiveStore — the panel-docking UX is shared, but artifacts
 * are static renderables (no canvas/version machinery).
 */
export interface CodeArtifact extends ArtifactData {
  /** Stable id so a card can tell whether it is the currently-open artifact. */
  id: string;
}

/**
 * Client-only panel variant: an in-place preview of a generated sheet /
 * presentation / doc, opened from DocumentCreatedCard instead of a new tab.
 * Not part of the wire-level `artifact` SSE event — `documentId`/`subtype`/
 * `url` come straight off the `document_created` payload.
 */
export interface DocumentArtifact {
  id: string;
  type: 'document';
  documentId: string;
  subtype: string;
  title: string;
  url: string;
}

/**
 * A deep research run in progress, shown in the panel while it works.
 *
 * The only artifact that changes after it opens, hence `upsertResearchLog`
 * alongside the wholesale setter: the run emits one `research_log_start` and
 * then a stream of partial updates over several minutes. Steps merge by id —
 * the same step arrives twice, once `running` and once `done`.
 *
 * When the run finishes it produces a real document; `documentUrl` carries it so
 * the panel can hand over to the ordinary `document` view in place.
 */
export interface ResearchLogStep {
  id: string;
  label: string;
  status: 'running' | 'done' | 'failed';
}

export interface ResearchLogArtifact {
  id: string;
  type: 'research_log';
  title: string;
  /** The agent's plan (`write_todos`). Replaced wholesale on each update. */
  plan: ResearchLogStep[];
  /** Tool activity, in the order it first appeared. */
  steps: ResearchLogStep[];
  status: 'running' | 'done' | 'failed';
  documentUrl?: string;
  documentId?: string;
}

export type ActiveArtifact = CodeArtifact | DocumentArtifact | ResearchLogArtifact;

interface ArtifactLiveStore {
  activeArtifact: ActiveArtifact | null;
  /**
   * True while an ArtifactPanel is mounted somewhere in the tree. The panel is
   * only rendered on /chat; the cards that write activeArtifact also render in
   * the Sheets/Docs/Presentations assistant chats, where opening "into the
   * panel" would do nothing visible — they check this flag and fall back to a
   * plain link instead.
   */
  panelMounted: boolean;
  /**
   * True while die Chat-Spalte breit genug ist, dass die Schiene neben dem Faden
   * andockt statt sich über ihn zu legen. Geschrieben von der Chat-Seite, die
   * als Einzige die Shell-Box misst — das Fenster ist kein Ersatz dafür, es ist
   * um die App-Seitenleiste breiter als die Spalte.
   */
  panelDockable: boolean;
  setActiveArtifact: (artifact: ActiveArtifact | null) => void;
  setPanelMounted: (mounted: boolean) => void;
  setPanelDockable: (dockable: boolean) => void;
  /**
   * Merge a partial research-log update into the open log.
   *
   * A no-op unless a research log with this id is the active artifact: late
   * updates from a run the user has already navigated away from must not
   * re-open the panel over whatever they are looking at now.
   */
  upsertResearchLog: (id: string, patch: Partial<Omit<ResearchLogArtifact, 'id' | 'type'>>) => void;
}

/** Merge by id, preserving first-seen order; unknown ids append. */
function mergeSteps(current: ResearchLogStep[], incoming: ResearchLogStep[]): ResearchLogStep[] {
  if (incoming.length === 0) return current;
  const next = [...current];
  for (const step of incoming) {
    const at = next.findIndex((s) => s.id === step.id);
    if (at >= 0) next[at] = step;
    else next.push(step);
  }
  return next;
}

export const useArtifactLiveStore = create<ArtifactLiveStore>((set) => ({
  activeArtifact: null,
  panelMounted: false,
  setPanelMounted: (mounted) => set({ panelMounted: mounted }),
  panelDockable: false,
  setPanelDockable: (dockable) => set({ panelDockable: dockable }),
  setActiveArtifact: (artifact) => {
    // Only one docked panel at a time: opening an artifact closes an active
    // sharepic/reel. (Those stores don't import this one, so no cycle.)
    if (artifact) {
      if (useSharepicLiveStore.getState().activeVariant) {
        useSharepicLiveStore.getState().setActiveVariant(null);
      }
      if (useReelLiveStore.getState().activeReel) {
        useReelLiveStore.getState().setActiveReel(null);
      }
    }
    set({ activeArtifact: artifact });
  },
  upsertResearchLog: (id, patch) =>
    set((state) => {
      const active = state.activeArtifact;
      if (!active || active.type !== 'research_log' || active.id !== id) return state;
      return {
        activeArtifact: {
          ...active,
          ...patch,
          plan: patch.plan ?? active.plan,
          steps: mergeSteps(active.steps, patch.steps ?? []),
        },
      };
    }),
}));

/**
 * Ob ein eingehendes Artefakt die Schiene von selbst aufziehen darf.
 *
 * Nur wo sie andockt: schafft die Spalte die 72rem nicht, liegt die Schiene über
 * dem Faden, und ein ungefragtes Aufziehen verdeckt die Antwort, die gerade
 * weiterläuft. Die Karte im Faden bleibt, ein Tipp darauf öffnet weiterhin.
 *
 * Gemessen wird nicht hier — der SSE-Parser kennt keine Layout-Box. Die
 * Chat-Seite misst ihre Shell und meldet das Ergebnis als `panelDockable`; das
 * ist dieselbe Messung, die über angedockt vs. überlagernd entscheidet. Wo
 * niemand meldet (React Native, Editor-Chats) bleibt es beim `false` aus dem
 * Anfangszustand: dort rendert keine Schiene.
 */
export function canAutoOpenArtifactPanel(): boolean {
  return useArtifactLiveStore.getState().panelDockable;
}

// Reverse direction of the one-docked-panel rule: activating a sharepic or reel
// clears an active artifact. Those stores can't import this one (cycle), so the
// coupling lives here as subscriptions — mirroring the reel<->sharepic pattern
// in reelLiveStore.ts. setState (not setActiveArtifact) avoids re-triggering the
// forward clear. Without this, opening a sharepic/reel while an artifact is
// docked would render two panels side by side.
useSharepicLiveStore.subscribe((state, prevState) => {
  if (
    state.activeVariant &&
    state.activeVariant !== prevState.activeVariant &&
    useArtifactLiveStore.getState().activeArtifact
  ) {
    useArtifactLiveStore.setState({ activeArtifact: null });
  }
});

useReelLiveStore.subscribe((state, prevState) => {
  if (
    state.activeReel &&
    state.activeReel !== prevState.activeReel &&
    useArtifactLiveStore.getState().activeArtifact
  ) {
    useArtifactLiveStore.setState({ activeArtifact: null });
  }
});
