import { Suspense, lazy, Component, type ReactNode } from 'react';

import { isDesktopApp } from '../../../utils/platform';
import { minimizeWindow, toggleMaximizeWindow, closeWindow } from '../../../utils/tauriWindow';
import ProfileButton from '../Header/ProfileButton';
import '../../../assets/styles/components/layout/profile-dropdown.css';
import './desktop-titlebar.css';

const TabBar = lazy(() => import('../DesktopTabs/TabBar').catch(() => ({ default: () => null })));

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
        <div className="titlebar-title" data-tauri-drag-region>
          Grünerator
        </div>
      );
    }
    return this.props.children;
  }
}

const TitlebarFallback = () => (
  <div className="titlebar-title" data-tauri-drag-region>
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
    <div className="desktop-titlebar" data-tauri-drag-region onDoubleClick={handleDoubleClick}>
      <TabBarErrorBoundary>
        <Suspense fallback={<TitlebarFallback />}>
          <TabBar />
        </Suspense>
      </TabBarErrorBoundary>

      <div className="titlebar-controls">
        <div className="desktop-titlebar-profile">
          <ProfileButton />
        </div>
        <button
          className="titlebar-button minimize"
          onClick={() => void minimizeWindow()}
          aria-label="Minimieren"
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          className="titlebar-button maximize"
          onClick={() => void toggleMaximizeWindow()}
          aria-label="Maximieren"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button className="titlebar-button close" onClick={() => void closeWindow()} aria-label="Schließen">
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
