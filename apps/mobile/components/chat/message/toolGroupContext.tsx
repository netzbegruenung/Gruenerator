import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Which finished tool runs the reader has expanded.
 *
 * Web gets this for free: assistant-ui's `ToolGroup` slot hands `ToolCallGroup`
 * the whole card stack as `children`, so one component can hold the state and
 * simply not render them. `@assistant-ui/react-native` has no such slot — every
 * card renders itself — so the collapsed state has to live above them all and be
 * keyed by run.
 */

interface ToolGroupState {
  expanded: ReadonlySet<string>;
  toggle: (runKey: string) => void;
}

const ToolGroupContext = createContext<ToolGroupState | null>(null);

export function ToolGroupScope({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = useCallback((runKey: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(runKey)) next.add(runKey);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ expanded, toggle }), [expanded, toggle]);
  return <ToolGroupContext.Provider value={value}>{children}</ToolGroupContext.Provider>;
}

/** Null outside a scope — a card rendered on its own stays expanded. */
export function useToolGroupExpanded(runKey: string): {
  isExpanded: boolean;
  toggle: () => void;
} {
  const ctx = useContext(ToolGroupContext);
  const toggle = ctx?.toggle;
  return {
    isExpanded: ctx ? ctx.expanded.has(runKey) : true,
    toggle: useCallback(() => toggle?.(runKey), [toggle, runKey]),
  };
}
