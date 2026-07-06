import { type JSX, useEffect, Suspense, lazy, useState, type ReactNode, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useDesktopTabsStore } from '../../../stores/desktopTabsStore';
import useSidebarStore from '../../../stores/sidebarStore';
import { isDesktopApp } from '../../../utils/platform';
import { Sidebar } from '../../layout/Sidebar';
import SidebarToggle from '../../layout/SidebarToggle';

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
  const hideAppHeader = useSidebarStore((state) => state.hideAppHeader);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isHomePage = pathname === '/';
  const { createTab, navigateTab, activeTabId } = useDesktopTabsStore();

  useEffect(() => {
    const footerTimeout = setTimeout(() => {
      setShowFooter(true);
    }, 1000);

    return () => clearTimeout(footerTimeout);
  }, []);

  const handleDesktopNavigation = useCallback(
    (path: string, title: string) => {
      // Compare against the ACTUAL current URL, not the stored tab route — the
      // tab's route can go stale when navigation happens outside the sidebar
      // (e.g. opening a document via a link), which would otherwise make a
      // sidebar click a no-op (clicking "Workplace" from a doc did nothing).
      if (pathname !== path) {
        // Navigate WITHIN the current tab. New tabs are opened only manually
        // (the "+" button / ⌘T); sidebar navigation must not spawn one each
        // time, or every click piles up another tab.
        if (activeTabId) {
          navigateTab(activeTabId, path, title);
        } else {
          createTab(path, title);
        }
        void navigate(path);
      }
    },
    [pathname, activeTabId, navigateTab, createTab, navigate]
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
        {/* Chat runtime (GlobalChatProvider) + GlobalBridges are mounted once
            at the app root (App.tsx), wrapping all routes — not here, which
            would re-mount on every navigation. */}
        <div className="desktop-content-area">
          <Sidebar isDesktop={true} onNavigate={handleDesktopNavigation} />
          <main className="ml-14 min-h-[calc(100vh-var(--titlebar-height))] flex-1 flex flex-col items-stretch transition-[margin-left] duration-200 [--canvas-host-inset-left:3.5rem]">
            {children}
          </main>
        </div>
      </div>
    );
  }

  const isImmersive = layoutMode === 'immersive';
  const isSidebarOnly = layoutMode === 'sidebarOnly' || hideAppHeader;
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
    (layoutMode === 'sidebarOnly' || isSidebarOnly) && 'mt-0 min-h-0',
    layoutMode === 'default' && !isSidebarOnly && 'mt-lg'
  );

  const appContentClasses = cn(
    'app-content',
    layoutMode === 'fullscreen' && 'flex flex-col h-dvh pt-12',
    layoutMode === 'immersive' && 'flex flex-col h-dvh',
    (layoutMode === 'sidebarOnly' || isSidebarOnly) && 'flex flex-col h-dvh'
  );

  const showPageFooter = showFooter && isHomePage && layoutMode === 'default';

  // GlobalChatProvider + GlobalBridges are mounted once at the app root
  // (App.tsx) wrapping all routes — not per-page here.
  return (
    <div className={layoutClasses}>
      {!hideHeader ? (
        <header className="fixed top-0 left-0 right-0 z-[1002] flex items-center px-2.5 h-12 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-0">
            <SidebarToggle />
            {sidebarOpen && (
              <>
                <img
                  src="/images/gruenerator_logo_gruen.svg"
                  alt="Grünerator"
                  className="h-7 w-auto shrink-0 dark:hidden"
                />
                <img
                  src="/images/gruenerator_logo_weiss.svg"
                  alt="Grünerator"
                  aria-hidden="true"
                  className="hidden h-7 w-auto shrink-0 dark:block"
                />
              </>
            )}
          </div>
        </header>
      ) : isSidebarOnly ? (
        <div className="fixed top-0 left-0 z-[1002] px-2.5 h-12 flex items-center pointer-events-none">
          <div className="pointer-events-auto">
            <SidebarToggle />
          </div>
        </div>
      ) : null}
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
  );
};

export default PageLayout;
