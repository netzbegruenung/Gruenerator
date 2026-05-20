'use client';

import { createContext, useContext } from 'react';

/**
 * Visual density of the chat surface. `comfortable` is the full-page default
 * (Tailwind `text-sm` / generous padding). `compact` is for narrow / embedded
 * surfaces like the docs editor sidebar (~13px font, tighter spacing) where
 * fitting more messages above the fold matters more than reading comfort.
 */
export type ChatDensity = 'comfortable' | 'compact';

export const ChatDensityContext = createContext<ChatDensity>('comfortable');

export function useChatDensity(): ChatDensity {
  return useContext(ChatDensityContext);
}
