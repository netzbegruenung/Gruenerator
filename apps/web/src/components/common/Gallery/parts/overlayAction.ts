/**
 * Round, frosted overlay button on a gallery thumbnail. Permanently visible rather
 * than hover-revealed, so touch users reach the actions without a long-press, and
 * dark-on-image in both themes so it stays legible over any artwork.
 *
 * Die Deckkraft ist gemessen, nicht geraten: das weiße Glyph erreicht auf der
 * Füllung über **jedem** Motiv mindestens 5,0:1 (Worst Case weißes Motiv, die
 * Füllung wird dort zu #6F7170) — das trägt WCAG 1.4.11. Die Ringkante selbst
 * verschwindet über mitteltonigen Motiven; das ist hingenommen, weil das Glyph
 * das Bedienelement identifiziert. **Nicht** die Deckkraft erhöhen, um die
 * Kante zu retten: über dunklen Motiven wird sie dadurch schlechter, nicht
 * besser. Geliked (primary-500) liegt bei 3,73:1 — Bestand, siehe variables.css.
 */
export const overlayAction =
  'flex size-[34px] items-center justify-center rounded-full border border-white/[0.16] ' +
  'bg-[#0f1210]/60 text-white backdrop-blur-sm ' +
  'transition-[transform,background-color] duration-150 ' +
  'hover:scale-110 active:scale-[0.94] disabled:pointer-events-none disabled:opacity-60';

/**
 * Top-right row for {@link overlayAction} buttons. z-[2] statt
 * `interactiveCardControl`: dessen `relative` würde das `absolute` hier aufheben
 * — Tailwind gibt `.relative` NACH `.absolute` aus, gleiche Spezifität, also
 * gewinnt das Falsche und die Knöpfe rutschen aus der Ecke in den Bildfluss.
 */
export const overlayRow = 'absolute right-2.5 top-2.5 z-[2] flex items-center gap-2';

/** Base classes of every gallery card (Vorlagen, Mediathek). */
export const galleryCard =
  'flex flex-col overflow-hidden rounded-lg border border-grey-200 bg-background text-left ' +
  'cursor-pointer transition-colors duration-150 hover:border-primary-500 dark:border-grey-700';
