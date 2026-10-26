/**
 * Wohin der Fokus geht, wenn das, was ihn hatte, verschwindet — ein
 * geschlossener Text-Editor, ein gelöschtes Element, ein Knopf, der sich
 * selbst abräumt. Nie auf `<body>`: von dort beginnt die Tab-Reihenfolge
 * wieder oben auf der Seite.
 *
 * Zurückgegeben wird nur, wenn der Fokus wirklich verloren ist. Wer
 * woanders hingeklickt hat, behält, was er angeklickt hat.
 */

const PAGE_WRAPPER = '.heterogeneous-multipage__page-wrapper';
const PAGE_TARGET = '[data-page-focus-target]';
const EDITOR_ROOT = '.canvas-editor-layout';
const LAYER_OPTION = '[role="option"][data-layer-id]';

/** Kam die letzte Fokusbewegung von der Tastatur? (`data-focus-modality` am `<html>`, siehe `kbd:`) */
export function isKeyboardModality(): boolean {
  return document.documentElement.dataset.focusModality === 'keyboard';
}

export function isFocusLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body;
}

/**
 * Der Knopf „Seite N bearbeiten" der Seite, in der `anchor` liegt (etwa der
 * Container der Bühne); sonst der der aktiven Seite im selben Editor.
 */
export function pageFocusTarget(anchor: Element | null): HTMLElement | null {
  const own = anchor?.closest(PAGE_WRAPPER)?.querySelector<HTMLElement>(PAGE_TARGET);
  if (own) return own;
  const scope: ParentNode = anchor?.closest(EDITOR_ROOT) ?? document;
  return (
    scope.querySelector<HTMLElement>(`[aria-current="page"] ${PAGE_TARGET}`) ??
    scope.querySelector<HTMLElement>(PAGE_TARGET)
  );
}

/** Woher eine Bearbeitung kam: ein Eintrag der Ebenen-Liste oder die Seite um `anchor`. */
export interface FocusOrigin {
  option: HTMLElement | null;
  anchor: Element | null;
}

/** Beim Start einer Bearbeitung aufrufen, solange der Fokus noch dort ist, wo sie begann. */
export function captureFocusOrigin(anchor: Element | null): FocusOrigin {
  const active = document.activeElement;
  const option = active instanceof HTMLElement ? active.closest<HTMLElement>(LAYER_OPTION) : null;
  return { option, anchor };
}

/**
 * Gibt den Fokus an den Ursprung zurück, sobald der Browser ihn fertig
 * verschoben hat — ein Klick auf ein anderes Bedienelement fokussiert es
 * erst nach dem Blur, der die Bearbeitung beendet.
 */
export function returnFocus(origin: FocusOrigin, onlyIf: () => boolean = () => true): void {
  window.setTimeout(() => {
    if (!isFocusLost() || !onlyIf()) return;
    const target = origin.option?.isConnected ? origin.option : pageFocusTarget(origin.anchor);
    // Kein Scrollen: auf einer hohen, mehrseitigen Fläche spränge die Ansicht
    // sonst an den Kopf der Seite.
    target?.focus({ preventScroll: true });
  }, 0);
}

/** Wie `returnFocus`, aber immer auf die Seite. */
export function returnFocusToPage(anchor: Element | null, onlyIf?: () => boolean): void {
  returnFocus({ option: null, anchor }, onlyIf);
}
