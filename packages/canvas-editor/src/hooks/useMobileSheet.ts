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
 */
export function useMobileSheet({
  isOpen,
  onClose,
  onDragClosed,
  threshold = 100,
  velocityThreshold = 0.5,
}: UseMobileSheetOptions): UseMobileSheetReturn {
  const handleRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

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

    const start = (e: TouchEvent, isContent: boolean) => {
      if (closing) return;
      const touch = e.touches[0];
      mode = 'pending';
      fromContent = isContent;
      startX = touch.clientX || 0;
      startY = touch.clientY;
      deltaY = 0;
      sampleCount = 0;
      record(startY);
    };

    const move = (e: TouchEvent) => {
      if (mode === 'idle' || mode === 'scroll') return;
      const touch = e.touches[0];
      const dy = touch.clientY - startY;
      record(touch.clientY);

      if (mode === 'pending') {
        const dx = (touch.clientX || 0) - startX;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_SLOP_PX) return;
        if (fromContent && (dy <= Math.abs(dx) || (content?.scrollTop ?? 0) > 0)) {
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

    const end = () => {
      const wasDragging = mode === 'drag';
      mode = 'idle';
      if (!wasDragging) return;
      setIsDragging(false);
      sheet.style.willChange = '';

      // A flick decides by itself; a long drag closes unless flicked back up.
      const velocity = releaseVelocity();
      const shouldClose =
        velocity > velocityThreshold || (deltaY > threshold && velocity >= -velocityThreshold);

      if (!shouldClose) {
        sheet.style.transition = reducedMotion() ? 'none' : SHEET_TRANSITION;
        sheet.style.transform = '';
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
    handle.addEventListener('touchcancel', end);
    content?.addEventListener('touchstart', onContentStart, { passive: true });
    content?.addEventListener('touchmove', move, { passive: false });
    content?.addEventListener('touchend', end);
    content?.addEventListener('touchcancel', end);

    return () => {
      window.clearTimeout(fallbackTimer);
      sheet.removeEventListener('transitionend', onTransitionEnd);
      handle.removeEventListener('touchstart', onHandleStart);
      handle.removeEventListener('touchmove', move);
      handle.removeEventListener('touchend', end);
      handle.removeEventListener('touchcancel', end);
      content?.removeEventListener('touchstart', onContentStart);
      content?.removeEventListener('touchmove', move);
      content?.removeEventListener('touchend', end);
      content?.removeEventListener('touchcancel', end);
    };
  }, [isOpen, threshold, velocityThreshold]);

  return {
    handleRef,
    sheetRef,
    contentRef,
    isDragging,
  };
}
