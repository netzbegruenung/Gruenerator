// SPDX-License-Identifier: MPL-2.0
import type Konva from 'konva';

/**
 * Hält ein an `document.body` gehängtes Eingabefeld über seinem Text, solange
 * die Bühne wandert oder sich ändert: Scrollen eines Vorfahren, Fenstergröße,
 * Zoom, ein aufklappendes Seitenpanel (WCAG 1.4.4 / 1.4.10).
 *
 * `ResizeObserver` meldet reine Lageverschiebungen nicht — das Panel schiebt
 * den Container, ohne ihn zu vergrössern. Darum werden auch sein Elternelement
 * und die Editor-Fläche beobachtet: deren Grösse ändert sich, wenn das Panel
 * Platz nimmt. Mehrere Auslöser im selben Frame ergeben ein einziges
 * `reposition`. Der Rückgabewert räumt alles ab.
 */
const EDITOR_ROOT = '.canvas-editor-layout';

export function followStage(stage: Konva.Stage, reposition: () => void): () => void {
  const container = stage.container();
  let frame = 0;

  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      reposition();
    });
  };

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  if (observer) {
    const watched = new Set<Element>([container]);
    if (container.parentElement) watched.add(container.parentElement);
    const root = container.closest(EDITOR_ROOT);
    if (root) watched.add(root);
    watched.forEach((element) => observer.observe(element));
  }

  // Capture-Phase: `scroll` blubbert nicht, so kommt das Scrollen jedes Vorfahren an.
  window.addEventListener('scroll', schedule, { capture: true, passive: true });
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);

  return () => {
    cancelAnimationFrame(frame);
    frame = 0;
    observer?.disconnect();
    window.removeEventListener('scroll', schedule, { capture: true });
    window.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('scroll', schedule);
  };
}
