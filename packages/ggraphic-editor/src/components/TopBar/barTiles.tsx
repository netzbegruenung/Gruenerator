// SPDX-License-Identifier: MPL-2.0
import React, { createContext, useContext } from 'react';

/**
 * Kacheln statt Knöpfe: mobil steht unter jedem Werkzeug der Auswahl-Leiste
 * sein Name, wie in der Bereichs-Leiste und bei Canva — eine Reihe nackter
 * Icons neben dem Wort „Position“ wirkte unruhig und sagte nicht, was ein
 * Knopf tut. Die Bausteine bleiben dieselben; `MobileSelectionBar` setzt den
 * Kontext, die Desktop-Leiste und das mobile Sheet nicht.
 *
 * Wo die Kachel ein Wort zeigt, muss der Name des Knopfs damit beginnen
 * (WCAG 2.5.3): Sprachsteuerung tippt, was sie sieht.
 */
const BarTilesContext = createContext(false);

export function BarTilesProvider({ children }: { children: React.ReactNode }) {
  return <BarTilesContext.Provider value>{children}</BarTilesContext.Provider>;
}

export function useBarTiles(): boolean {
  return useContext(BarTilesContext);
}

/** Eine Kachel: Icon oben, Wort darunter, 56 px hoch; die Wörter stehen unten auf einer Linie. */
export const TILE =
  'inline-flex flex-col items-center justify-end gap-1 min-w-14 h-14 px-1.5 pb-2 shrink-0 rounded-lg border-none bg-transparent cursor-pointer whitespace-nowrap text-[11px] font-medium leading-none text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] data-[state=open]:bg-[var(--editor-active-bg)] data-[state=open]:text-[var(--editor-active-fg)] aria-pressed:bg-[var(--editor-active-bg)] aria-pressed:text-[var(--editor-active-fg)] disabled:opacity-30 disabled:cursor-not-allowed';

/**
 * Das Wort unter der Kachel, nur im Kachel-Modus. `decorative`, wo das Wort
 * eine Gruppe beschriftet, deren Knöpfe eigene Namen tragen (Schriftgröße).
 */
export function TileCaption({
  children,
  decorative = false,
}: {
  children: React.ReactNode;
  decorative?: boolean;
}) {
  if (!useBarTiles()) return null;
  return (
    <span
      className="text-[11px] font-medium leading-none text-[var(--editor-text-secondary)]"
      aria-hidden={decorative || undefined}
    >
      {children}
    </span>
  );
}
