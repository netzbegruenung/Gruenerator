import { useRef } from 'react';

const THROTTLE_MS = 500;
const lastLogTime: Record<string, number> = {};
const pendingCounts: Record<string, number> = {};

/**
 * Dev-only hook that logs which props changed when a component rerenders.
 * Complete no-op in production (tree-shaken by Vite).
 */
export function useRenderTracker(componentName: string, props: Record<string, unknown>): void {
  const prevPropsRef = useRef<Record<string, unknown> | null>(null);

  if (!import.meta.env.DEV) return;

  if (prevPropsRef.current !== null) {
    const changedProps: Record<string, { from: unknown; to: unknown }> = {};
    const allKeys = new Set([...Object.keys(prevPropsRef.current), ...Object.keys(props)]);

    for (const key of allKeys) {
      if (prevPropsRef.current[key] !== props[key]) {
        changedProps[key] = {
          from: prevPropsRef.current[key],
          to: props[key],
        };
      }
    }

    if (Object.keys(changedProps).length > 0) {
      const now = Date.now();
      const lastTime = lastLogTime[componentName] || 0;

      if (now - lastTime < THROTTLE_MS) {
        pendingCounts[componentName] = (pendingCounts[componentName] || 0) + 1;
      } else {
        const pendingCount = pendingCounts[componentName] || 0;
        const countSuffix = pendingCount > 0 ? ` (+${pendingCount} batched)` : '';

        console.log(
          `%c[RenderTracker] ${componentName}${countSuffix}`,
          'color: #22c55e; font-weight: bold',
          changedProps
        );

        lastLogTime[componentName] = now;
        pendingCounts[componentName] = 0;
      }
    }
  }

  prevPropsRef.current = { ...props };
}
