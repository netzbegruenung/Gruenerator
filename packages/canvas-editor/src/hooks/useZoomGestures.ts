import Konva from 'konva';
import { useEffect } from 'react';

const ZOOM_SETTLE_MS = 150;

/** The element the editor scrolls in — the app shell's <main>, or the window. */
function scrollParentOf(el: HTMLElement): Element | Window {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return window;
}

interface ZoomGestureOptions {
  minZoom?: number;
  maxZoom?: number;
  /** The container scales from its top-left corner (mobile, see canvas-editor.css). */
  leftOrigin?: boolean;
}

/** canvas-editor.css centres a narrower-than-wide container via translateX(max(0, (1 - s) · 50%)). */
function leftOriginOffset(scale: number, width: number): number {
  return Math.max(0, ((1 - scale) * width) / 2);
}

/**
 * Horizontal scroll that keeps the point `anchorX` px right of the container's
 * left edge in place while a top-left-origin container goes from scale `from`
 * to `to`.
 */
export function horizontalAnchorScroll(anchorX: number, width: number, from: number, to: number) {
  return (
    leftOriginOffset(to, width) - leftOriginOffset(from, width) + (anchorX * (to - from)) / from
  );
}

/**
 * Wires pinch (two-finger touch) and ctrl/cmd + wheel gestures to the
 * editor's existing zoom state (the CSS `--canvas-zoom` scale that
 * CanvasMetaBar's buttons already control). While an element is dragged or
 * transformed the wheel neither zooms nor scrolls: either would move the
 * page under a pointer that holds an element.
 *
 * Takes the element, not a ref: the editor renders a loading state first, and
 * an effect keyed on a ref never re-ran once the pages container mounted —
 * no listener was ever attached.
 *
 * During a gesture the scale is written straight to `--canvas-zoom` once per
 * frame, with `data-zooming` switching off the CSS transition (it made the
 * canvas trail behind the fingers); React state follows when the gesture
 * settles, so the editor shell doesn't re-render on every wheel/pinch event.
 *
 * Listeners attach to the surrounding canvas region rather than the pages
 * container itself, so gestures still work over the empty margin when the
 * canvas is zoomed out. Double-click/double-tap on that empty margin resets
 * to 100% (the canvas itself keeps double-click for inline text editing).
 */
export function useZoomGestures(
  container: HTMLElement | null,
  onZoomChange: React.Dispatch<React.SetStateAction<number>>,
  { minZoom = 0.25, maxZoom = 1.5, leftOrigin = false }: ZoomGestureOptions = {}
): void {
  useEffect(() => {
    if (!container) return;
    const target =
      (container.closest('.canvas-editor-layout__canvas') as HTMLElement | null) ??
      container.parentElement ??
      container;

    const clamp = (z: number) => Math.min(maxZoom, Math.max(minZoom, z));

    let liveZoom = 1;
    let appliedZoom = 1;
    let anchorClientX = 0;
    let anchorClientY = 0;
    let sheetScale = 1;
    let scroller: Element | Window = window;
    let frame: number | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    // Keeps the point under the cursor/pinch centre in place vertically: the
    // scale grows from the container's top edge, so the scroll container scrolls by the
    // distance that point moved. Horizontally only a left-origin container is
    // anchored — a centred one pushes content past the left edge, where no
    // scrollbar reaches.
    const applyZoom = () => {
      frame = null;
      const rect = container.getBoundingClientRect();
      const anchorY = (anchorClientY - rect.top) / appliedZoom;
      const dx = leftOrigin
        ? horizontalAnchorScroll(
            anchorClientX - rect.left,
            container.offsetWidth,
            appliedZoom * sheetScale,
            liveZoom * sheetScale
          )
        : 0;
      container.style.setProperty('--canvas-zoom', String(liveZoom));
      scroller.scrollBy(dx, anchorY * (liveZoom - appliedZoom));
      appliedZoom = liveZoom;
    };

    const zoomBy = (factor: number, clientX: number, clientY: number) => {
      if (settleTimer === null) {
        liveZoom = parseFloat(container.style.getPropertyValue('--canvas-zoom')) || 1;
        appliedZoom = liveZoom;
        sheetScale = parseFloat(container.style.getPropertyValue('--canvas-sheet-scale')) || 1;
        scroller = scrollParentOf(container);
        container.setAttribute('data-zooming', '');
      } else {
        clearTimeout(settleTimer);
      }
      liveZoom = clamp(liveZoom * factor);
      anchorClientX = clientX;
      anchorClientY = clientY;
      frame ??= requestAnimationFrame(applyZoom);
      settleTimer = setTimeout(() => {
        settleTimer = null;
        container.removeAttribute('data-zooming');
        onZoomChange(liveZoom);
      }, ZOOM_SETTLE_MS);
    };

    const onWheel = (e: WheelEvent) => {
      if (Konva.isDragging() || Konva.isTransforming()) {
        e.preventDefault();
        return;
      }
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY);
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
        const [a, b] = [...pointers.values()];
        zoomBy(dist / lastDistance, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      }
      lastDistance = dist;
    };

    const onPointerEnd = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      lastDistance = 0;
    };

    const onDoubleClick = (e: MouseEvent) => {
      // Only the empty margin resets — the canvas keeps dblclick-to-edit-text
      if (e.target !== target && e.target !== container) return;
      // A gesture still settling would re-apply its zoom over the reset.
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      if (settleTimer !== null) {
        clearTimeout(settleTimer);
        settleTimer = null;
        container.removeAttribute('data-zooming');
        // The gesture only wrote the CSS variable; React may still hold 1 and
        // would not re-render it.
        container.style.setProperty('--canvas-zoom', '1');
      }
      onZoomChange(1);
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
      if (frame !== null) cancelAnimationFrame(frame);
      if (settleTimer !== null) {
        clearTimeout(settleTimer);
        container.removeAttribute('data-zooming');
        onZoomChange(liveZoom);
      }
      target.removeEventListener('wheel', onWheel);
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerEnd);
      target.removeEventListener('pointercancel', onPointerEnd);
      target.removeEventListener('dblclick', onDoubleClick);
      target.removeEventListener('gesturestart', preventGesture);
      target.removeEventListener('gesturechange', preventGesture);
    };
  }, [container, onZoomChange, minZoom, maxZoom, leftOrigin]);
}
