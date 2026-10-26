/**
 * Tastenhoheit: welche Taste gehört einem fokussierten Widget, nicht dem Editor?
 *
 * Ein Regler verbraucht die Pfeile, ein Knopf Enter und Leertaste, ein Dialog
 * Escape. Der globale Handler lässt diese Tasten dann in Ruhe — sonst schöbe
 * ArrowRight am Deckkraft-Regler das Element, und Enter am Knopf öffnete die
 * Dateiauswahl. Entf/Rück und die Strg-Kürzel sind nie widget-eigen (R1): sie
 * gelten von jedem Fokus ausserhalb von Textfeldern. Alt+Pfeil schiebt immer.
 */

const ACTIVATION_OWNERS = [
  'button',
  'a[href]',
  'select',
  'summary',
  '[role=button]',
  '[role=link]',
  '[role=menuitem]',
  '[role=option]',
  '[role=tab]',
  '[role=checkbox]',
  '[role=radio]',
  '[role=switch]',
].join(',');

const NAVIGATION_OWNERS = [
  '[role=slider]',
  '[role=radio]',
  '[role=radiogroup]',
  '[role=tab]',
  '[role=tablist]',
  '[role=listbox]',
  '[role=option]',
  '[role=toolbar]',
  '[role=menu]',
  '[role=menubar]',
  '[role=spinbutton]',
  '[role=scrollbar]',
  'select',
  'input[type=range]',
].join(',');

const DISMISS_OWNERS = '[role=dialog],[role=menu]';

const NAVIGATION_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

export function isWidgetOwnedKey(e: KeyboardEvent): boolean {
  const target = e.target;
  if (!(target instanceof Element)) return false;
  if (e.key === 'Enter' || e.key === ' ') return target.closest(ACTIVATION_OWNERS) !== null;
  if (NAVIGATION_KEYS.has(e.key)) {
    if (e.altKey) return false;
    return target.closest(NAVIGATION_OWNERS) !== null;
  }
  if (e.key === 'Escape') return target.closest(DISMISS_OWNERS) !== null;
  return false;
}
