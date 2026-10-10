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

/**
 * Whether answers carry their action row (copy, read aloud, as document). Off where an answer
 * is only a step in an editor, like the studio's sharepic and image chats.
 */
export const ChatMessageActionsContext = createContext(true);

export function useChatMessageActions(): boolean {
  return useContext(ChatMessageActionsContext);
}

/**
 * Whether the person's own messages say which role they write in („Als …"). The role is the
 * account's chat role; an editor chat that never sends it must not claim it.
 */
export const ChatRoleBadgeContext = createContext(true);

export function useChatRoleBadge(): boolean {
  return useContext(ChatRoleBadgeContext);
}
