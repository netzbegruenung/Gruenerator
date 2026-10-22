import { useState, useEffect, useRef } from 'react';

interface UseMobileSheetOptions {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Called once a drag has carried the sheet off-screen, right before
   * `onClose` and in the same event — the owner can drop the sheet at once
   * instead of playing its own exit from the top.
   */
  onDragClosed?: () => void;
  /**
   * What the sheet shows (e.g. its title). A change while a drag-close slides
   * out aborts it — the close belonged to the previous content.
   */
  closeKey?: string | null;
  threshold?: number; // Swipe threshold to trigger close (in pixels)
  velocityThreshold?: number; // Release velocity threshold (px/ms)
}

interface UseMobileSheetReturn {
  /** Header: wraps the grab handle and the title row. */
  handleRef: React.RefObject<HTMLDivElement | null>;
  sheetRef: React.RefObject<HTMLElement | null>;
  /** The scroll container; pulls the sheet down only from its top. */
  contentRef: React.RefObject<HTMLDivElement | null>;
  isDragging: boolean;
}

const SHEET_TRANSITION = 'transform 200ms var(--editor-ease-out)';
const SHEET_FADE = 'opacity 200ms var(--editor-ease-out)';
/** Movement before a touch counts as a drag, so taps (close button) stay taps. */
const DRAG_SLOP_PX = 6;
/** Release velocity is measured over the samples within this window. */
const VELOCITY_WINDOW_MS = 80;
const SAMPLE_COUNT = 16;
/** Upper bound for the 200 ms slide-out when `transitionend` never comes. */
const CLOSE_FALLBACK_MS = 350;

interface Sample {
  y: number;
  t: number;
}

/**
 * Swipe-down-to-close for the mobile sheet. The drag writes the transform
 * straight onto `sheetRef` — a React render per touchmove drops frames on a
 * sheet full of tiles.
 *
 * The header (handle + title row, `touch-action: none`) drags with passive
 * listeners. The content drags only when it sits at its top and the move goes
 * down; anything else is left to native scrolling. Once the content has
 * handed the gesture to the sheet, its touchmove calls `preventDefault` —
 * the one non-passive listener — so the list does not scroll along.
 *
 * WebKit commits an unprevented first touchmove to native scrolling (the list
 * rubber-bands at its top) and later moves are no longer cancelable, so the
 * content claims the gesture on its FIRST move if that goes down and mostly
 * vertical; the slop then only decides between drag and nothing. Whether the
 * content may take over at all is settled at touchstart (list at its top, not
 * inside a textarea or a scrolled nested scroller): every other gesture
 * returns from the non-passive touchmove at its first line. Passivity is fixed
 * at registration and a listener added mid-gesture does not make that
 * gesture's moves cancelable, so the one listener stays.
 */
export function useMobileSheet({
  isOpen,
  onClose,
  onDragClosed,
  closeKey = null,
  threshold = 100,
  velocityThreshold = 0.5,
}: UseMobileSheetOptions): UseMobileSheetReturn {
  const handleRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Set while a drag-close slides out; aborts it and brings the sheet back.
  const abortCloseRef = useRef<(() => void) | null>(null);

  const onCloseRef = useRef(onClose);
  const onDragClosedRef = useRef(onDragClosed);
  useEffect(() => {
    onCloseRef.current = onClose;
    onDragClosedRef.current = onDragClosed;
  }, [onClose, onDragClosed]);

  useEffect(() => {
    const handle = handleRef.current;
    const sheet = sheetRef.current;
    if (!isOpen || !handle || !sheet) return;
    const content = contentRef.current;

    // A reopened sheet must not keep a previous drag's inline styles.
    sheet.style.transform = '';
    sheet.style.transition = '';
    sheet.style.opacity = '';
    sheet.style.willChange = '';

    // 'pending' until the touch moved past the slop; then the sheet drags, or
    // (content only) the browser scrolls for the rest of the gesture.
    let mode: 'idle' | 'pending' | 'drag' | 'scroll' = 'idle';
    let fromContent = false;
    // Content only: the first move went down, so the browser must not scroll.
    let claimed = false;
    // The finger that owns the gesture; other fingers are ignored.
    let activeId = 0;
    let startScrollTop = 0;
    let startX = 0;
    let startY = 0;
    let deltaY = 0;
    // Ring buffer of the latest touch positions for the release velocity.
    const samples: Sample[] = Array.from({ length: SAMPLE_COUNT }, () => ({ y: 0, t: 0 }));
    let sampleIndex = 0;
    let sampleCount = 0;
    let closing = false;
    let fallbackTimer = 0;

    const record = (y: number) => {
      const sample = samples[sampleIndex];
      sample.y = y;
      sample.t = Date.now();
      sampleIndex = (sampleIndex + 1) % SAMPLE_COUNT;
      sampleCount = Math.min(sampleCount + 1, SAMPLE_COUNT);
    };

    /** px/ms between the oldest and newest sample of the last 80 ms. */
    const releaseVelocity = () => {
      const now = Date.now();
      let newest: Sample | null = null;
      let oldest: Sample | null = null;
      for (let i = 1; i <= sampleCount; i++) {
        const sample = samples[(sampleIndex - i + SAMPLE_COUNT) % SAMPLE_COUNT];
        if (now - sample.t > VELOCITY_WINDOW_MS) break;
        newest ??= sample;
        oldest = sample;
      }
      if (!newest || !oldest || newest.t === oldest.t) return 0;
      return (newest.y - oldest.y) / (newest.t - oldest.t);
    };

    const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.target !== sheet) return;
      if (e.propertyName !== 'transform' && e.propertyName !== 'opacity') return;
      finishClose();
    };

    const finishClose = () => {
      if (!closing) return;
      closing = false;
      window.clearTimeout(fallbackTimer);
      sheet.removeEventListener('transitionend', onTransitionEnd);
      onDragClosedRef.current?.();
      onCloseRef.current();
    };

    abortCloseRef.current = () => {
      if (!closing) return;
      closing = false;
      window.clearTimeout(fallbackTimer);
      sheet.removeEventListener('transitionend', onTransitionEnd);
      sheet.style.opacity = '';
      snapBack();
    };

    const activeTouch = (list: TouchList) =>
      Array.from(list).find((t) => t.identifier === activeId) ?? null;

    /** A textarea or a scrolled scroller between the touch and the content keeps the touch. */
    const startsInNestedScroll = (target: EventTarget | null) => {
      for (let el = target instanceof Element ? target : null; el && el !== content;) {
        if (el instanceof HTMLTextAreaElement || el.scrollTop > 0) return true;
        el = el.parentElement;
      }
      return false;
    };

    const start = (e: TouchEvent, isContent: boolean) => {
      // A second finger neither restarts nor ends the running gesture.
      if (closing || mode !== 'idle' || e.touches.length > 1) return;
      const touch = e.touches[0];
      activeId = touch.identifier;
      fromContent = isContent;
      claimed = false;
      startScrollTop = isContent ? (content?.scrollTop ?? 0) : 0;
      // Decided here, so a scrolling list's moves skip the handler at once.
      mode =
        isContent && (startScrollTop > 0 || startsInNestedScroll(e.target)) ? 'scroll' : 'pending';
      startX = touch.clientX || 0;
      startY = touch.clientY;
      deltaY = 0;
      sampleCount = 0;
      record(startY);
    };

    const move = (e: TouchEvent) => {
      if (mode === 'idle' || mode === 'scroll') return;
      const touch = activeTouch(e.touches);
      if (!touch) return;
      const dy = touch.clientY - startY;
      record(touch.clientY);

      if (mode === 'pending') {
        const dx = (touch.clientX || 0) - startX;
        if (fromContent && !claimed) {
          if (dx === 0 && dy === 0) return;
          // First move: down and mostly vertical claims it, anything else scrolls.
          if (dy <= Math.abs(dx) || (content?.scrollTop ?? 0) > 0) {
            mode = 'scroll';
            return;
          }
          claimed = true;
        }
        if (claimed && e.cancelable) e.preventDefault();
        if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_SLOP_PX) return;
        const scrolled = (content?.scrollTop ?? 0) > 0;
        if (fromContent && (dy <= Math.abs(dx) || scrolled)) {
          mode = 'scroll';
          return;
        }
        if (dy <= 0) return; // header: wait for a downward move
        mode = 'drag';
        sheet.style.transition = 'none';
        sheet.style.willChange = 'transform';
        setIsDragging(true);
      }

      if (fromContent && e.cancelable) e.preventDefault();
      deltaY = Math.max(0, dy);
      sheet.style.transform = `translateY(${deltaY}px)`;
    };

    /** True if this touchend/cancel lifts the owning finger. */
    const endsGesture = (e: TouchEvent) =>
      mode !== 'idle' && (e.touches.length === 0 || activeTouch(e.changedTouches) !== null);

    /** Leaves drag mode; true if the sheet was being dragged. */
    const release = () => {
      const wasDragging = mode === 'drag';
      mode = 'idle';
      if (wasDragging) {
        setIsDragging(false);
        sheet.style.willChange = '';
      }
      return wasDragging;
    };

    const snapBack = () => {
      sheet.style.transition = reducedMotion() ? 'none' : SHEET_TRANSITION;
      sheet.style.transform = '';
    };

    // The system took the touch away (call, gesture, …): never a close.
    const cancel = (e: TouchEvent) => {
      if (endsGesture(e) && release()) snapBack();
    };

    const end = (e: TouchEvent) => {
      if (!endsGesture(e) || !release()) return;

      // A flick decides by itself; a long drag closes unless flicked back up.
      const velocity = releaseVelocity();
      const shouldClose =
        velocity > velocityThreshold || (deltaY > threshold && velocity >= -velocityThreshold);

      if (!shouldClose) {
        snapBack();
        return;
      }

      // Slide on from where the finger let go; reduced motion fades in place.
      closing = true;
      sheet.addEventListener('transitionend', onTransitionEnd);
      fallbackTimer = window.setTimeout(finishClose, CLOSE_FALLBACK_MS);
      if (reducedMotion()) {
        sheet.style.transition = SHEET_FADE;
        sheet.style.opacity = '0';
      } else {
        sheet.style.transition = SHEET_TRANSITION;
        sheet.style.transform = 'translateY(100%)';
      }
    };

    const onHandleStart = (e: TouchEvent) => start(e, false);
    const onContentStart = (e: TouchEvent) => start(e, true);

    handle.addEventListener('touchstart', onHandleStart, { passive: true });
    handle.addEventListener('touchmove', move, { passive: true });
    handle.addEventListener('touchend', end);
    handle.addEventListener('touchcancel', cancel);
    content?.addEventListener('touchstart', onContentStart, { passive: true });
    content?.addEventListener('touchmove', move, { passive: false });
    content?.addEventListener('touchend', end);
    content?.addEventListener('touchcancel', cancel);

    return () => {
      abortCloseRef.current = null;
      window.clearTimeout(fallbackTimer);
      sheet.removeEventListener('transitionend', onTransitionEnd);
      handle.removeEventListener('touchstart', onHandleStart);
      handle.removeEventListener('touchmove', move);
      handle.removeEventListener('touchend', end);
      handle.removeEventListener('touchcancel', cancel);
      content?.removeEventListener('touchstart', onContentStart);
      content?.removeEventListener('touchmove', move);
      content?.removeEventListener('touchend', end);
      content?.removeEventListener('touchcancel', cancel);
    };
  }, [isOpen, threshold, velocityThreshold]);

  // Another tab while the drag-close slides out: keep the sheet for it.
  useEffect(() => {
    abortCloseRef.current?.();
  }, [closeKey]);

  return {
    handleRef,
    sheetRef,
    contentRef,
    isDragging,
  };
}
