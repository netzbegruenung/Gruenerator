/**
 * Voice agent state machine.
 *
 * Transitions:
 *   idle ──activate──→ ready
 *   ready ──pressDown──→ recording
 *   recording ──pressUp──→ transcribing
 *   transcribing ──sttDone──→ thinking
 *   thinking ──firstTTSChunk──→ speaking
 *   speaking ──playbackEnd──→ ready
 *   speaking ──interrupt──→ ready (abort fetches + stop audio)
 *   any ──deactivate──→ idle
 *   any ──error──→ ready (with error, stays active)
 */

import { createStore } from 'zustand/vanilla';
import { type VoiceAgentPhase, type TranscriptEntry } from '../types';

export interface VoiceAgentStoreState {
  phase: VoiceAgentPhase;
  isActive: boolean;
  transcript: TranscriptEntry[];
  streamingText: string;
  threadId: string | null;
  error: string | null;
}

export interface VoiceAgentStoreActions {
  activate: () => void;
  deactivate: () => void;
  startRecording: () => void;
  stopRecording: () => void;
  onSTTDone: (text: string) => void;
  onFirstTTSChunk: () => void;
  onPlaybackEnd: () => void;
  onInterrupt: () => void;
  appendStreamingText: (delta: string) => void;
  finalizeAssistantTurn: () => void;
  setThreadId: (id: string) => void;
  setError: (error: string) => void;
  clearError: () => void;
  reset: () => void;
}

export type VoiceAgentStore = VoiceAgentStoreState & VoiceAgentStoreActions;

const initialState: VoiceAgentStoreState = {
  phase: 'idle',
  isActive: false,
  transcript: [],
  streamingText: '',
  threadId: null,
  error: null,
};

export function createVoiceAgentStore() {
  return createStore<VoiceAgentStore>((set) => ({
    ...initialState,

    activate: () => set({ phase: 'ready', isActive: true, error: null }),

    deactivate: () => set({ phase: 'idle', isActive: false, streamingText: '' }),

    startRecording: () =>
      set((state) => {
        if (state.phase !== 'ready') return state;
        return { phase: 'recording' };
      }),

    stopRecording: () =>
      set((state) => {
        if (state.phase !== 'recording') return state;
        return { phase: 'transcribing' };
      }),

    onSTTDone: (text: string) =>
      set((state) => {
        if (state.phase !== 'transcribing') return state;
        const entry: TranscriptEntry = {
          id: `user-${Date.now()}`,
          role: 'user',
          text,
          timestamp: Date.now(),
        };
        return {
          phase: 'thinking',
          transcript: [...state.transcript, entry],
          streamingText: '',
        };
      }),

    onFirstTTSChunk: () =>
      set((state) => {
        if (state.phase !== 'thinking') return state;
        return { phase: 'speaking' };
      }),

    onPlaybackEnd: () =>
      set((state) => {
        if (state.phase !== 'speaking') return state;
        return { phase: 'ready' };
      }),

    onInterrupt: () =>
      set((state) => {
        if (state.phase !== 'speaking' && state.phase !== 'thinking') return state;
        return { phase: 'ready', streamingText: '' };
      }),

    appendStreamingText: (delta: string) =>
      set((state) => ({ streamingText: state.streamingText + delta })),

    finalizeAssistantTurn: () =>
      set((state) => {
        if (!state.streamingText) return state;
        const entry: TranscriptEntry = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: state.streamingText,
          timestamp: Date.now(),
        };
        return {
          transcript: [...state.transcript, entry],
          streamingText: '',
        };
      }),

    setThreadId: (id: string) => set({ threadId: id }),

    setError: (error: string) =>
      set((state) => ({
        phase: state.isActive ? 'ready' : 'idle',
        error,
        streamingText: '',
      })),

    clearError: () => set({ error: null }),

    reset: () => set(initialState),
  }));
}
