// SPDX-License-Identifier: MPL-2.0
/**
 * Die eine Live-Region des Editors (WCAG 4.1.3): leer eingehängt, damit
 * Screenreader sie vor der ersten Ansage kennen; unsichtbar, aber nicht
 * `hidden`. Gefüllt wird sie über `useAnnounce()`.
 */
export function CanvasAnnouncer({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
