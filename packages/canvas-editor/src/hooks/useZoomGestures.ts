import { useEffect } from 'react';

interface ZoomGestureOptions {
  minZoom?: number;
  maxZoom?: number;
}

/**
 * Wires pinch (two-finger touch) and ctrl/cmd + wheel gestures to the
 * editor's existing zoom state (the CSS `--canvas-zoom` scale that
 * CanvasMetaBar's buttons already control).
 *
 * Listeners attach to the surrounding canvas region rather than the pages
 * container itself, so gestures still work over the empty margin when the
 * canvas is zoomed out. Double-click/double-tap on that empty margin resets
 * to 100% (the canvas itself keeps double-click for inline text editing).
 */
export function useZoomGestures(
  containerRef: React.RefObject<HTMLElement | null>,
  onZoomChange: React.Dispatch<React.SetStateAction<number>>,
  { minZoom = 0.25, maxZoom = 1.5 }: ZoomGestureOptions = {}
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const target =
      (container.closest('.canvas-editor-layout__canvas') as HTMLElement | null) ??
      container.parentElement ??
      container;

    const clamp = (z: number) => Math.min(maxZoom, Math.max(minZoom, z));

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.002);
      onZoomChange((prev) => clamp(prev * factor));
    };

    const pointers = new Map<number, { x: number; y: number }>();
    let lastDistance = 0;

    const currentDistance = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) lastDistance = currentDistance();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size !== 2) return;
      const dist = currentDistance();
      if (lastDistance > 0 && dist > 0) {
        const factor = dist / lastDistance;
        onZoomChange((prev) => clamp(prev * factor));
      }
      lastDistance = dist;
    };

    const onPointerEnd = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      lastDistance = 0;
    };

    const onDoubleClick = (e: MouseEvent) => {
      // Only the empty margin resets — the canvas keeps dblclick-to-edit-text
      if (e.target === target || e.target === container) onZoomChange(1);
    };

    // iOS Safari fires proprietary gesture events that zoom the page itself
    const preventGesture = (e: Event) => e.preventDefault();

    target.addEventListener('wheel', onWheel, { passive: false });
    target.addEventListener('pointerdown', onPointerDown);
    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerEnd);
    target.addEventListener('pointercancel', onPointerEnd);
    target.addEventListener('dblclick', onDoubleClick);
    target.addEventListener('gesturestart', preventGesture);
    target.addEventListener('gesturechange', preventGesture);

    return () => {
      target.removeEventListener('wheel', onWheel);
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerEnd);
      target.removeEventListener('pointercancel', onPointerEnd);
      target.removeEventListener('dblclick', onDoubleClick);
      target.removeEventListener('gesturestart', preventGesture);
      target.removeEventListener('gesturechange', preventGesture);
    };
  }, [containerRef, onZoomChange, minZoom, maxZoom]);
}
