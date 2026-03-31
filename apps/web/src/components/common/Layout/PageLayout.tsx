import { type JSX, useEffect, Suspense, lazy, useState, type ReactNode, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { GlobalChatProvider } from '../../../providers/GlobalChatProvider';
import { useDesktopTabsStore } from '../../../stores/desktopTabsStore';
import useSidebarStore from '../../../stores/sidebarStore';
import { isDesktopApp } from '../../../utils/platform';
import ProfileButton from '../../layout/Header/ProfileButton';
import { Sidebar } from '../../layout/Sidebar';
import SidebarToggle from '../../layout/SidebarToggle';

import { GlobalBridges } from './GlobalBridges';

import type { LayoutMode } from '../../../config/routes';

import { cn } from '@/utils/cn';

const Footer = lazy(() => import('../../layout/Footer/Footer'));

const DesktopTitlebar = lazy(() => import('../../layout/DesktopTitlebar/DesktopTitlebar'));
const UpdateNotification = lazy(
  () => import('../../desktop/UpdateNotification/UpdateNotification')
);

interface PageLayoutProps {
  children: ReactNode;
  darkMode: boolean;
  toggleDarkMode: () => void;
  layoutMode?: LayoutMode;
}

const PageLayout = ({
  children,
  darkMode,
  toggleDarkMode,
  layoutMode = 'default',
}: PageLayoutProps): JSX.Element => {
  const [showFooter, setShowFooter] = useState(false);
  const sidebarOpen = useSidebarStore((state) => state.isOpen);
  const hideAppSidebar = useSidebarStore((state) => state.hideAppSidebar);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isHomePage = pathname === '/';
  const { createTab, tabs, activeTabId } = useDesktopTabsStore();

  useEffect(() => {
    const footerTimeout = setTimeout(() => {
      setShowFooter(true);
    }, 1000);

    return () => clearTimeout(footerTimeout);
  }, []);

  const handleDesktopNavigation = useCallback(
    (path: string, title: string) => {
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (activeTab?.route !== path) {
        createTab(path, title);
        void navigate(path);
      }
    },
    [tabs, activeTabId, createTab, navigate]
  );

  if (layoutMode === 'noChrome') {
    return <main className="min-h-dvh">{children}</main>;
  }

  const isDesktop = isDesktopApp();

  if (isDesktop) {
    return (
      <div className="desktop-layout">
        <Suspense fallback={null}>
          <DesktopTitlebar />
        </Suspense>
        <Suspense fallback={null}>
          <UpdateNotification />
        </Suspense>
        <div className="desktop-content-area">
          <Sidebar isDesktop={true} onNavigate={handleDesktopNavigation} />
          <main className="ml-14 min-h-[calc(100vh-var(--titlebar-height))] flex-1 flex flex-col items-center transition-[margin-left] duration-200">
            {children}
          </main>
        </div>
      </div>
    );
  }

  const isImmersive = layoutMode === 'immersive';
  const isSidebarOnly = layoutMode === 'sidebarOnly';
  const hideHeader = isImmersive || isSidebarOnly;

  const layoutClasses = [
    'app-layout',
    sidebarOpen ? 'sidebar-open' : '',
    hideAppSidebar || isImmersive ? 'sidebar-hidden' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const mainClasses = cn(
    'relative flex-1',
    layoutMode === 'fullscreen' && 'mt-0 min-h-0 overflow-hidden',
    layoutMode === 'immersive' && 'mt-0 min-h-0 overflow-y-auto',
    layoutMode === 'sidebarOnly' && 'mt-0',
    layoutMode === 'default' && 'mt-lg'
  );

  const appContentClasses = cn(
    'app-content',
    layoutMode === 'fullscreen' && 'flex flex-col h-dvh pt-12',
    layoutMode === 'immersive' && 'flex flex-col h-dvh'
  );

  const showPageFooter = showFooter && isHomePage && layoutMode === 'default';

  return (
    <GlobalChatProvider>
      <GlobalBridges />
      <div className={layoutClasses}>
        {!hideHeader && (
          <header className="fixed top-0 left-0 right-0 z-[1002] flex items-center justify-between px-2 h-12 pointer-events-none">
            <div className="pointer-events-auto">
              <SidebarToggle />
            </div>
            <div className="pointer-events-auto flex items-center gap-1">
              <ProfileButton />
            </div>
          </header>
        )}
        <Sidebar />
        <div className={appContentClasses}>
          <main className={mainClasses}>{children}</main>
          {showPageFooter && (
            <Suspense fallback={<div style={{ height: '80px' }} />}>
              <Footer />
            </Suspense>
          )}
        </div>
      </div>
    </GlobalChatProvider>
  );
};

export default PageLayout;
