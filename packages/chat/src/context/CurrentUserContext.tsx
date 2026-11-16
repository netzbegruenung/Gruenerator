'use client';

import { createContext, useContext } from 'react';

/** The signed-in user's id, so message components can tell their own turns from teammates'. */
export const CurrentUserContext = createContext<string | null>(null);

export function useCurrentUserId(): string | null {
  return useContext(CurrentUserContext);
}
