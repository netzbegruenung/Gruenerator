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

/**
 * Bedienelemente der Textformat-Leiste tragen dieses Attribut: wandert der
 * Fokus dorthin, bleibt der Texteditor offen (`RichTextField`).
 */
export const KEEP_EDITING_ATTR = 'data-rte-keep-editing';

export const keepsEditing = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(`[${KEEP_EDITING_ATTR}]`) !== null;

/**
 * Wird gerade Text bearbeitet? Ein Eingabefeld, ein contenteditable — oder
 * die Formatleiste des offenen Texteditors: dort steht der Fokus auf einem
 * Knopf, der Text ist aber weiter in Bearbeitung, und Rück, Strg+Z oder
 * Alt+Pfeil dürfen nicht das Element darunter löschen, zurücknehmen oder
 * schieben.
 */
export function isTextEditingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable) ||
    keepsEditing(target)
  );
}

/**
 * Lässt der Editor diese Taste liegen? Ja, wenn Text bearbeitet wird oder ein
 * Widget sie schon verbraucht hat (`preventDefault`, etwa der Radix-Regler bei
 * Alt+Pfeil — der Editor schöbe sonst zusätzlich das Element).
 */
export function editorSkipsKey(e: KeyboardEvent): boolean {
  return e.defaultPrevented || isTextEditingTarget(e.target);
}
