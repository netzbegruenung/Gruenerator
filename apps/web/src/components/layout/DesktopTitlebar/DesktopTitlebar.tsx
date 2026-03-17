import { Suspense, lazy, Component, type ReactNode } from 'react';

import { isDesktopApp } from '../../../utils/platform';
import { minimizeWindow, toggleMaximizeWindow, closeWindow } from '../../../utils/tauriWindow';
import ProfileButton from '../Header/ProfileButton';

const TabBar = lazy(() => import('../DesktopTabs/TabBar').catch(() => ({ default: () => null })));
const NotificationCenter = lazy(
  () => import('../../../features/notifications/components/NotificationCenter')
);

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

const DesktopTitlebar = () => {
  if (!isDesktopApp()) return null;

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('.tab-bar-container') || target.closest('.titlebar-controls')) {
      return;
    }
    void toggleMaximizeWindow();
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 h-[var(--titlebar-height)] bg-[var(--bar-background)] flex items-center justify-between p-0 pl-16 z-[9999] select-none"
      style={appRegionDrag}
      data-tauri-drag-region
      onDoubleClick={handleDoubleClick}
    >
      <TabBarErrorBoundary>
        <Suspense fallback={<TitlebarFallback />}>
          <TabBar />
        </Suspense>
      </TabBarErrorBoundary>

      <div className="flex items-center gap-0" style={appRegionNoDrag}>
        <div
          className="px-3 flex items-center h-[var(--titlebar-height)] [&_[data-slot=dropdown-menu-trigger]]:!border-none [&_[data-slot=dropdown-menu-trigger]]:!bg-transparent [&_[data-slot=dropdown-menu-trigger]]:!shadow-none [&_[data-slot=dropdown-menu-trigger]]:!w-8 [&_[data-slot=dropdown-menu-trigger]]:!h-8 [&_[data-slot=dropdown-menu-trigger]]:!p-0 [&>button]:!border-none [&>button]:!bg-transparent [&>button]:!shadow-none [&>button]:!w-8 [&>button]:!h-8 [&>button]:!p-0 [&>a]:!border-none [&>a]:!bg-transparent [&>a]:!shadow-none [&>a]:!w-8 [&>a]:!h-8 [&>a]:!p-0 [&_a]:h-[var(--titlebar-height)] [&_a]:flex [&_a]:items-center [&_a_svg]:text-2xl [&_a_svg]:text-grey-500 [&_a:hover_svg]:text-primary-600 dark:[&_a_svg]:text-grey-400 dark:[&_a:hover_svg]:text-primary-400"
          style={appRegionNoDrag}
        >
          <Suspense fallback={null}>
            <NotificationCenter />
          </Suspense>
          <ProfileButton />
        </div>
        <button
          className="w-[46px] h-[var(--titlebar-height)] flex items-center justify-center bg-transparent border-none text-grey-500 dark:text-grey-400 cursor-pointer transition-colors duration-150 hover:bg-grey-100 hover:text-grey-700 dark:hover:bg-grey-700 dark:hover:text-grey-200 [&_svg]:w-2.5 [&_svg]:h-2.5"
          style={appRegionNoDrag}
          onClick={() => void minimizeWindow()}
          aria-label="Minimieren"
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          className="w-[46px] h-[var(--titlebar-height)] flex items-center justify-center bg-transparent border-none text-grey-500 dark:text-grey-400 cursor-pointer transition-colors duration-150 hover:bg-grey-100 hover:text-grey-700 dark:hover:bg-grey-700 dark:hover:text-grey-200 [&_svg]:w-2.5 [&_svg]:h-2.5"
          style={appRegionNoDrag}
          onClick={() => void toggleMaximizeWindow()}
          aria-label="Maximieren"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          className="w-[46px] h-[var(--titlebar-height)] flex items-center justify-center bg-transparent border-none text-grey-500 dark:text-grey-400 cursor-pointer transition-colors duration-150 hover:bg-[#e81123] hover:text-white [&_svg]:w-2.5 [&_svg]:h-2.5"
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
    </div>
  );
};

export default DesktopTitlebar;
