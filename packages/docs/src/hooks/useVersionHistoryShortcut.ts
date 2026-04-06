import { useEffect, useRef } from 'react';

export function useVersionHistoryShortcut(
  sidebarOpen: boolean,
  sidebarTab: string,
  setSidebarOpen: (open: boolean) => void,
  setSidebarTab: (tab: 'versions') => void
) {
  const sidebarOpenRef = useRef(sidebarOpen);
  const sidebarTabRef = useRef(sidebarTab);
  sidebarOpenRef.current = sidebarOpen;
  sidebarTabRef.current = sidebarTab;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'h') {
        e.preventDefault();
        if (sidebarOpenRef.current && sidebarTabRef.current === 'versions') {
          setSidebarOpen(false);
        } else {
          setSidebarTab('versions');
          setSidebarOpen(true);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setSidebarOpen, setSidebarTab]);
}
