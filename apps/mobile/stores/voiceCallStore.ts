import { type ToolCall } from '@gruenerator/voice/mistral';
import { create } from 'zustand';

/**
 * What the running voice call reports beyond the thread: the tool the agent is
 * in (the blob's caption), the last error, and how many cards it has put into
 * the chat (the overlay steps aside when one arrives).
 *
 * Written by the adapter, which lives with the chat's runtime in
 * `MobileChatProvider`; read by the call overlay drawn over that chat. One call
 * runs at a time, so one slot. Not persisted: a call does not outlive the app.
 */
interface VoiceCallState {
  tool: ToolCall | null;
  error: string | null;
  cardsShown: number;
}

export const useVoiceCallStore = create<VoiceCallState>(() => ({
  tool: null,
  error: null,
  cardsShown: 0,
}));
