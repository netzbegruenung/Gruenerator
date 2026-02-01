import { memo, useRef, useEffect, useCallback } from 'react';

const GRID_SIZE = 16;
const DOT_RADIUS = 0.75;
const MOUSE_RADIUS = 120;
const MOUSE_PUSH = 6;
const FADE_START = 0;
const FADE_END = 0.4;
const SWEEP_BAND_HALF = 30;
const SWEEP_SPEED = 0.0004;
const SCATTER_PUSH = 8;
const SCATTER_BREATHE = 0.001;
const SCATTER_DRIFT = 0.0007;
const SCATTER_DRIFT_AMOUNT = 2.5;
const SCATTER_EASE_SPEED = 0.04;
const TWO_PI = Math.PI * 2;
const ALPHA_BUCKETS = 10;

// Pre-computed hex strings for alpha values 0–255
const ALPHA_HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

// Since FADE_START is 0, the fade math simplifies
const FADE_START_IS_ZERO = FADE_START === 0;

interface ScatterCache {
  cols: number;
  rows: number;
  w: number;
  h: number;
  dirX: Float32Array;
  dirY: Float32Array;
  perpX: Float32Array;
  perpY: Float32Array;
  strength: Float32Array;
  phase: Float32Array;
  driftPhase: Float32Array;
}

interface DotGridProps {
  className?: string;
  isProcessing?: boolean;
}

function readCssColors(): { primary: string; default: string } {
  const style = getComputedStyle(document.documentElement);
  return {
    primary: style.getPropertyValue('--primary-300').trim() || '#8AC9B0',
    default: style.getPropertyValue('--grey-300').trim() || '#bdbdbd',
  };
}

function makeFillStyle(color: string, alphaBucket: number): string {
  if (alphaBucket >= ALPHA_BUCKETS) return color;
  const alpha255 = Math.round((alphaBucket / ALPHA_BUCKETS) * 255);
  return color + ALPHA_HEX[alpha255];
}

const DotGrid = memo(function DotGrid({ className, isProcessing = false }: DotGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const rafRef = useRef<number>(0);
  const isVisibleRef = useRef(true);
  const prefersReducedMotionRef = useRef(false);
  const needsDrawRef = useRef(true);
  const isDraggingFileRef = useRef(false);
  const isProcessingRef = useRef(false);
  const dragCounterRef = useRef(0);
  const scatterCacheRef = useRef<ScatterCache | null>(null);
  const scatterAmountRef = useRef(0);
  const colorCacheRef = useRef<{ primary: string; default: string } | null>(null);

  const getScatterCache = useCallback(
    (cols: number, rows: number, w: number, h: number): ScatterCache => {
      const cache = scatterCacheRef.current;
      if (cache && cache.cols === cols && cache.rows === rows && cache.w === w && cache.h === h) {
        return cache;
      }
      const total = cols * rows;
      const dirX = new Float32Array(total);
      const dirY = new Float32Array(total);
      const perpX = new Float32Array(total);
      const perpY = new Float32Array(total);
      const strength = new Float32Array(total);
      const phase = new Float32Array(total);
      const driftPhase = new Float32Array(total);
      const cx = w * 0.5;
      const cy = h * 0.5;
      const maxDist = Math.sqrt(cx * cx + cy * cy);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const bx = c * GRID_SIZE;
          const by = r * GRID_SIZE;
          const dx = bx - cx;
          const dy = by - cy;
          const d = Math.sqrt(dx * dx + dy * dy);
          const normDist = d / maxDist;
          strength[idx] = 1 - normDist * 0.6;
          if (d > 0) {
            dirX[idx] = dx / d;
            dirY[idx] = dy / d;
            perpX[idx] = -dy / d;
            perpY[idx] = dx / d;
          }
          phase[idx] = (bx * 0.013 + by * 0.017) % TWO_PI;
          driftPhase[idx] = (bx * 0.021 + by * 0.009 + 1.7) % TWO_PI;
        }
      }
      const newCache: ScatterCache = {
        cols,
        rows,
        w,
        h,
        dirX,
        dirY,
        perpX,
        perpY,
        strength,
        phase,
        driftPhase,
      };
      scatterCacheRef.current = newCache;
      return newCache;
    },
    []
  );

  const draw = useCallback(
    (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }

      ctx.clearRect(0, 0, w, h);

      if (!colorCacheRef.current) {
        colorCacheRef.current = readCssColors();
      }
      const { primary: primaryColor, default: defaultColor } = colorCacheRef.current;

      const isDragging = isDraggingFileRef.current;
      const processing = isProcessingRef.current;
      const dotColor =
        isDragging || (processing && prefersReducedMotionRef.current) ? primaryColor : defaultColor;

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const hasMouseInteraction = !prefersReducedMotionRef.current && !isDragging && mx > -500;

      const cols = Math.ceil(w / GRID_SIZE) + 1;
      const rows = Math.ceil(h / GRID_SIZE) + 1;
      const fadeEndPx = h * FADE_END;
      const fadeDenom = FADE_START_IS_ZERO ? fadeEndPx : fadeEndPx - h * FADE_START;
      const fadeOffset = FADE_START_IS_ZERO ? 0 : h * FADE_START;

      const sweepY =
        processing && !prefersReducedMotionRef.current
          ? ((timestamp * SWEEP_SPEED) % 1) * (h + SWEEP_BAND_HALF * 2) - SWEEP_BAND_HALF
          : -1;

      // Smooth scatter transition: lerp toward target
      const scatterTarget = isDragging && !prefersReducedMotionRef.current ? 1 : 0;
      const prevScatter = scatterAmountRef.current;
      const scatterAmount = prevScatter + (scatterTarget - prevScatter) * SCATTER_EASE_SPEED;
      scatterAmountRef.current = Math.abs(scatterAmount) < 0.001 ? 0 : scatterAmount;

      const scatter = scatterAmount > 0.001 ? getScatterCache(cols, rows, w, h) : null;
      const breatheT = timestamp * SCATTER_BREATHE;
      const driftT = timestamp * SCATTER_DRIFT;

      // Spatial culling bounds for mouse interaction
      let mColStart = 0,
        mColEnd = 0,
        mRowStart = 0,
        mRowEnd = 0;
      if (hasMouseInteraction) {
        mColStart = Math.max(0, Math.floor((mx - MOUSE_RADIUS) / GRID_SIZE) - 1);
        mColEnd = Math.min(cols, Math.ceil((mx + MOUSE_RADIUS) / GRID_SIZE) + 1);
        mRowStart = Math.max(0, Math.floor((my - MOUSE_RADIUS) / GRID_SIZE) - 1);
        mRowEnd = Math.min(rows, Math.ceil((my + MOUSE_RADIUS) / GRID_SIZE) + 1);
      }

      // Path2D batching: buckets indexed by [colorIndex * (ALPHA_BUCKETS+1) + alphaBucket]
      // colorIndex: 0 = dotColor, 1 = primaryColor
      const bucketCount = 2 * (ALPHA_BUCKETS + 1);
      const paths: (Path2D | null)[] = new Array(bucketCount).fill(null);

      for (let row = 0; row < rows; row++) {
        const baseY = row * GRID_SIZE;

        let verticalAlpha = 1;
        if (baseY < fadeEndPx) {
          verticalAlpha = Math.max(0, (baseY - fadeOffset) / fadeDenom);
        }
        if (verticalAlpha <= 0) continue;

        for (let col = 0; col < cols; col++) {
          const baseX = col * GRID_SIZE;

          let drawX = baseX;
          let drawY = baseY;
          let mouseAlpha = 1;
          let usePrimary = false;

          if (scatter) {
            const idx = row * cols + col;
            const pulse = 0.7 + 0.3 * Math.sin(breatheT + scatter.phase[idx]);
            const radialPush = SCATTER_PUSH * scatter.strength[idx] * pulse * scatterAmount;
            const drift =
              Math.sin(driftT + scatter.driftPhase[idx]) * SCATTER_DRIFT_AMOUNT * scatterAmount;
            drawX += scatter.dirX[idx] * radialPush + scatter.perpX[idx] * drift;
            drawY += scatter.dirY[idx] * radialPush + scatter.perpY[idx] * drift;
          } else if (processing && !prefersReducedMotionRef.current) {
            const dist = Math.abs(baseY - sweepY);
            if (dist < SWEEP_BAND_HALF) {
              const proximity = 1 - dist / SWEEP_BAND_HALF;
              const eased = proximity * proximity * (3 - 2 * proximity);
              mouseAlpha = 1 + eased * 0.5;
              usePrimary = true;
            }
          } else if (hasMouseInteraction) {
            if (row >= mRowStart && row < mRowEnd && col >= mColStart && col < mColEnd) {
              const dx = baseX - mx;
              const dy = baseY - my;
              const dist = Math.sqrt(dx * dx + dy * dy);

              if (dist < MOUSE_RADIUS && dist > 0) {
                const influence = 1 - dist / MOUSE_RADIUS;
                const eased = influence * influence;
                const push = eased * MOUSE_PUSH;
                drawX += (dx / dist) * push;
                drawY += (dy / dist) * push;
                mouseAlpha = 0.4 + 0.6 * (1 - eased);
              }
            }
          }

          const alpha = verticalAlpha * mouseAlpha;
          if (alpha <= 0.01) continue;

          const clampedAlpha = Math.min(alpha, 1);
          const alphaBucket =
            clampedAlpha >= 0.99 ? ALPHA_BUCKETS : Math.round(clampedAlpha * ALPHA_BUCKETS);
          if (alphaBucket === 0) continue;

          const colorIdx = usePrimary ? 1 : 0;
          const bucketIdx = colorIdx * (ALPHA_BUCKETS + 1) + alphaBucket;

          let p = paths[bucketIdx];
          if (!p) {
            p = new Path2D();
            paths[bucketIdx] = p;
          }
          p.arc(drawX, drawY, DOT_RADIUS, 0, TWO_PI);
          p.closePath();
        }
      }

      // Pass 2: one fill call per active bucket
      const colors = [dotColor, primaryColor];
      for (let ci = 0; ci < 2; ci++) {
        for (let ai = 1; ai <= ALPHA_BUCKETS; ai++) {
          const p = paths[ci * (ALPHA_BUCKETS + 1) + ai];
          if (!p) continue;
          ctx.fillStyle = makeFillStyle(colors[ci], ai);
          ctx.fill(p);
        }
      }
    },
    [getScatterCache]
  );

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotionRef.current = mql.matches;

    const onChange = (e: MediaQueryListEvent) => {
      prefersReducedMotionRef.current = e.matches;
      needsDrawRef.current = true;
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
    needsDrawRef.current = true;
  }, [isProcessing]);

  // Cache CSS colors and invalidate on theme change
  useEffect(() => {
    colorCacheRef.current = readCssColors();

    const observer = new MutationObserver(() => {
      colorCacheRef.current = readCssColors();
      needsDrawRef.current = true;
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (prefersReducedMotionRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      needsDrawRef.current = true;
    };

    const handleLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
      needsDrawRef.current = true;
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    window.addEventListener('mouseleave', handleLeave);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseleave', handleLeave);
    };
  }, []);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        dragCounterRef.current++;
        if (!isDraggingFileRef.current) {
          isDraggingFileRef.current = true;
          needsDrawRef.current = true;
        }
      }
    };

    const handleDragLeave = () => {
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        isDraggingFileRef.current = false;
        needsDrawRef.current = true;
      }
    };

    const handleDrop = () => {
      dragCounterRef.current = 0;
      isDraggingFileRef.current = false;
      needsDrawRef.current = true;
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting) needsDrawRef.current = true;
      },
      { threshold: 0 }
    );

    if (canvasRef.current) observer.observe(canvasRef.current);

    const loop = (timestamp: number) => {
      if (isVisibleRef.current) {
        const continuousAnim =
          !prefersReducedMotionRef.current &&
          (isDraggingFileRef.current ||
            isProcessingRef.current ||
            scatterAmountRef.current > 0.001);
        if (continuousAnim) {
          draw(timestamp);
        } else if (needsDrawRef.current) {
          draw(timestamp);
          needsDrawRef.current = false;
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, [draw]);

  useEffect(() => {
    const handleResize = () => {
      needsDrawRef.current = true;
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
});

export default DotGrid;
