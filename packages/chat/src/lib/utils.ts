export { cn } from '@gruenerator/ui';

const composerButtonBase = 'flex items-center transition-colors';

const composerToolbarButtonBase = `${composerButtonBase} rounded-lg text-foreground-muted hover:text-foreground hover:bg-grey-100 active:bg-grey-200 dark:hover:bg-grey-800 dark:active:bg-grey-700`;

export function composerToolbarButtonClass(isCompact = false): string {
  return isCompact
    ? `${composerToolbarButtonBase} gap-1 px-1.5 py-1 text-[13px]`
    : `${composerToolbarButtonBase} gap-1.5 px-2 py-1.5 text-sm`;
}

/**
 * Ein Chip in der Composer-Zeile, der einen aktiven Zustand trägt: die Rolle
 * am Plus, die Recherchetiefe. Beide waren dieselbe abgetippte Klassenkette und
 * liefen auseinander — der eine mager mit `tracking-tight` auf 12px, der andere
 * fett auf 13px.
 *
 * Die Maße kommen aus dem Entwurf „Rollen-Chip Varianten", Variante 2c,
 * umgerechnet auf unseren Maßstab: der Entwurf steht auf einem 20px-Platzhalter,
 * unser Composer erbt 16px, also 1,25×. Aus 16px Schrift werden 13px, aus der
 * Polsterung 10/16/10/14px werden 8/12/8/10px, aus 8px Innenabstand 6px.
 *
 * Die Farben sind unsere Tokens, nicht die Handwerte des Entwurfs: `#ecf3ef`
 * und `#3d6f5d` stehen in keinem Token, die `.dc.html` ist durchgehend inline
 * gestylt. `primary-50` liegt ohnehin auf dem Grund des Entwurfs (Δ 4/5/5), und
 * `primary-700` darauf trägt 8,4:1 statt der 5,1:1 des Entwurfs.
 *
 * Bewusst NICHT auf `composerToolbarButtonClass` aufgesetzt: dessen `px-2`
 * überlebt ein späteres `pl-2.5` auch durch tailwind-merge (`px` verdrängt
 * `pl`/`pr`, nicht umgekehrt), die Polsterung hinge dann an der Reihenfolge im
 * Stylesheet. Hier steht jede Eigenschaft genau einmal.
 */
export function composerActiveChipClass(isCompact = false): string {
  const shape = isCompact
    ? 'gap-1 py-1.5 pl-2 pr-2.5 text-[12px]'
    : 'gap-1.5 py-2 pl-2.5 pr-3 text-[13px]';
  return `${composerButtonBase} rounded-full font-bold tracking-[0.03em] ${shape} bg-primary-50 text-primary-700 hover:bg-primary-100 active:bg-primary-200 dark:bg-primary-400/15 dark:text-primary-200 dark:hover:bg-primary-400/25 dark:active:bg-primary-400/30`;
}

/**
 * Das Zeichen im aktiven Chip. 14px statt der 16px des Toolbar-Knopfs: der
 * Entwurf setzt Zeichen und Schrift gleich groß, und die Schrift ist hier 13px.
 */
export const composerActiveChipIconClass = 'h-3.5 w-3.5';
