import { createContext, useContext } from 'react';

import type { Row } from '../types';

/**
 * Opens the board's one card context menu for a row. Null = no menu: the board
 * is read-only (public board, locked) and the browser's own menu stays.
 */
export type OpenCardMenu = (row: Row, event: React.MouseEvent<HTMLElement>) => void;

const CardMenuContext = createContext<OpenCardMenu | null>(null);

export const CardMenuProvider = CardMenuContext.Provider;

export function useOpenCardMenu(): OpenCardMenu | null {
  return useContext(CardMenuContext);
}
