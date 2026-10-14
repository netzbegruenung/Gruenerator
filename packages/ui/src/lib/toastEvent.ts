// Radix wertet einen Klick in einen Toast als Klick außerhalb des Dialogs und
// schließt ihn — „Rückgängig" im Toast würde den Dialog dahinter mitnehmen.
export function isToastEvent(event: Event): boolean {
  return event.target instanceof Element && event.target.closest('[data-sonner-toaster]') !== null;
}
