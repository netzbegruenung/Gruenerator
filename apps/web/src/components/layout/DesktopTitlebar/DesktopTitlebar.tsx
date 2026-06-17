import { Suspense, lazy, Component, type ReactNode } from 'react';

import { getDesktopOS, isDesktopApp } from '../../../utils/platform';
import { minimizeWindow, toggleMaximizeWindow, closeWindow } from '../../../utils/tauriWindow';

const TabBar = lazy(() => import('../DesktopTabs/TabBar').catch(() => ({ default: () => null })));

const appRegionDrag = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const appRegionNoDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

interface TabBarErrorBoundaryProps {
  children: ReactNode;
}

interface TabBarErrorBoundaryState {
  hasError: boolean;
}

class TabBarErrorBoundary extends Component<TabBarErrorBoundaryProps, TabBarErrorBoundaryState> {
  state: TabBarErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[TabBar] Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex-1 text-primary-600 dark:text-primary-300 text-sm font-semibold pl-3"
          style={appRegionDrag}
          data-tauri-drag-region
        >
          Grünerator
        </div>
      );
    }
    return this.props.children;
  }
}

const TitlebarFallback = () => (
  <div
    className="flex-1 text-primary-600 dark:text-primary-300 text-sm font-semibold pl-3"
    style={appRegionDrag}
    data-tauri-drag-region
  >
    Grünerator
  </div>
);

/**
 * Windows / Linux caption controls (minimize, maximize, close) following the
 * Windows 11 layout: equal-width buttons docked top-right, close turns red on hover.
 * On macOS these are intentionally not rendered — the native traffic lights are
 * overlaid by the OS via `titleBarStyle: "Overlay"`.
 */
const CaptionControls = () => (
  <div className="flex items-center h-full" style={appRegionNoDrag}>
    <button
      className="titlebar-controls w-[46px] h-full flex items-center justify-center bg-transparent border-none text-grey-500 dark:text-grey-400 cursor-pointer transition-colors duration-150 hover:bg-grey-100 hover:text-grey-700 dark:hover:bg-grey-700 dark:hover:text-grey-200 [&_svg]:w-2.5 [&_svg]:h-2.5"
      style={appRegionNoDrag}
      onClick={() => void minimizeWindow()}
      aria-label="Minimieren"
    >
      <svg width="10" height="1" viewBox="0 0 10 1">
        <rect width="10" height="1" fill="currentColor" />
      </svg>
    </button>
    <button
      className="titlebar-controls w-[46px] h-full flex items-center justify-center bg-transparent border-none text-grey-500 dark:text-grey-400 cursor-pointer transition-colors duration-150 hover:bg-grey-100 hover:text-grey-700 dark:hover:bg-grey-700 dark:hover:text-grey-200 [&_svg]:w-2.5 [&_svg]:h-2.5"
      style={appRegionNoDrag}
      onClick={() => void toggleMaximizeWindow()}
      aria-label="Maximieren"
    >
      <svg width="10" height="10" viewBox="0 0 10 10">
        <rect width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
    </button>
    <button
      className="titlebar-controls w-[46px] h-full flex items-center justify-center bg-transparent border-none text-grey-500 dark:text-grey-400 cursor-pointer transition-colors duration-150 hover:bg-[#c42b1c] hover:text-white [&_svg]:w-2.5 [&_svg]:h-2.5"
      style={appRegionNoDrag}
      onClick={() => void closeWindow()}
      aria-label="Schließen"
    >
      <svg width="10" height="10" viewBox="0 0 10 10">
        <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
        <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </button>
  </div>
);

const DesktopTitlebar = () => {
  if (!isDesktopApp()) return null;

  const isMac = getDesktopOS() === 'macos';

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('.tab-bar-container') || target.closest('.titlebar-controls')) {
      return;
    }
    void toggleMaximizeWindow();
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 h-[var(--titlebar-height)] bg-[var(--bar-background)] flex items-center justify-between z-[9999] select-none"
      style={{
        ...appRegionDrag,
        // macOS keeps the native title bar (traffic lights live there); this row holds
        // the tabs beneath it. Windows/Linux are frameless, so tabs hug the edge and
        // the custom caption controls sit on the right.
        paddingLeft: 8,
        paddingRight: isMac ? 8 : 0,
      }}
      data-tauri-drag-region
      onDoubleClick={handleDoubleClick}
    >
      <TabBarErrorBoundary>
        <Suspense fallback={<TitlebarFallback />}>
          <TabBar />
        </Suspense>
      </TabBarErrorBoundary>

      {!isMac && <CaptionControls />}
    </div>
  );
};

export default DesktopTitlebar;
