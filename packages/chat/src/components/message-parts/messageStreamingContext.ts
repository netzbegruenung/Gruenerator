import { createContext, useContext } from 'react';

/**
 * Whether the assistant message currently rendering is still streaming.
 * AssistantMessage provides the real value; anything rendered outside a message
 * (default `false`) is treated as settled. ChatCodeBlock reads this to auto-run
 * a spreadsheet-compute block only once the code has finished streaming (running
 * a half-streamed block would execute broken Python).
 */
const MessageStreamingContext = createContext(false);

export const MessageStreamingProvider = MessageStreamingContext.Provider;

export function useIsMessageStreaming(): boolean {
  return useContext(MessageStreamingContext);
}
