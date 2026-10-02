import { createContext, useContext } from 'react';

/**
 * A thread's accent colour (the notebook berry) for the parts rendered deep
 * inside it — the user's own bubble. `null` keeps the app's eucalyptus.
 */
const ChatAccentContext = createContext<string | null>(null);

export const ChatAccentProvider = ChatAccentContext.Provider;

export function useChatAccent(): string | null {
  return useContext(ChatAccentContext);
}
