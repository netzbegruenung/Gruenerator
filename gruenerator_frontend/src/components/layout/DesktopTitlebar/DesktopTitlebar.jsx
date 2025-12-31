import React, { Suspense, lazy, Component } from 'react';
import { isDesktopApp } from '../../../utils/platform';
import ProfileButton from '../Header/ProfileButton';
import '../../../assets/styles/components/layout/profile-dropdown.css';
import './desktop-titlebar.css';

// Lazy load TabBar so it doesn't crash the titlebar if it fails
const TabBar = lazy(() => import('../DesktopTabs/TabBar').catch(() => ({ default: () => null })));

// Error boundary to catch TabBar errors
class TabBarErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
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

// Fallback title shown while TabBar loads or if it fails
const TitlebarFallback = () => (
  <div className="titlebar-title" data-tauri-drag-region>
    Grünerator
  </div>
);

const DesktopTitlebar = () => {
  if (!isDesktopApp()) return null;

  const handleMinimize = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().minimize();
  };

  const handleMaximize = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    const isMaximized = await win.isMaximized();
    if (isMaximized) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  };

  const handleClose = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().close();
  };

  const handleDoubleClick = (e) => {
    if (e.target.closest('.tab-bar-container') || e.target.closest('.titlebar-controls')) {
      return;
    }
    handleMaximize();
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
          onClick={handleMinimize}
          aria-label="Minimieren"
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          className="titlebar-button maximize"
          onClick={handleMaximize}
          aria-label="Maximieren"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          className="titlebar-button close"
          onClick={handleClose}
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
