import { useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useDesktopTabsStore } from '../stores/desktopTabsStore';
import { isDesktopApp } from '../utils/platform';

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Start',
  '/universal': 'Universal',
  '/antrag': 'Anträge',
  '/presse-social': 'Presse & Social',
  '/kampagnen': 'Kampagnen',
  '/accessibility': 'Barrierefreiheit',
  '/alttext': 'Alt-Text',
  '/website': 'Website',
  '/image-studio': 'Image Studio',
  '/image-studio/edit': 'Bild bearbeiten',
  '/image-studio/templates': 'Sharepics',
  '/reel': 'Reel Studio',
  '/chat': 'Chat',
  '/suche': 'Suche',
  '/oparl': 'OParl',
  '/galerie': 'Galerie',
  '/vorlagen': 'Vorlagen',
  '/texte': 'Texte',
  '/profile': 'Profil',
  '/login': 'Anmelden',
  '/registrierung': 'Registrierung',
  '/datenschutz': 'Datenschutz',
  '/impressum': 'Impressum',
  '/support': 'Support',
  '/notebook': 'Notebook',
  '/notebooks': 'Notebooks',
  '/survey': 'Umfragen',
  '/editor': 'Editor',
};

const getRouteTitle = (pathname: string): string => {
  if (ROUTE_TITLES[pathname]) {
    return ROUTE_TITLES[pathname];
  }

  for (const [routePath, title] of Object.entries(ROUTE_TITLES)) {
    if (pathname.startsWith(routePath + '/')) {
      return title;
    }
  }

  if (pathname === '/') return 'Start';

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0) {
    const lastSegment = segments[segments.length - 1];
    if (lastSegment.length < 20 && !/^[a-f0-9-]{20,}$/i.test(lastSegment)) {
      return lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1).replace(/-/g, ' ');
    }
    if (segments.length > 1) {
      const parentSegment = segments[segments.length - 2];
      return parentSegment.charAt(0).toUpperCase() + parentSegment.slice(1).replace(/-/g, ' ');
    }
  }

  return 'Grünerator';
};

export const useDesktopTabs = () => {
  const location = useLocation();
  const { activeTabId, navigateTab } = useDesktopTabsStore();
  const isFirstRender = useRef(true);
  const lastSyncedPath = useRef<string | null>(null);

  const syncRouteToActiveTab = useCallback((pathname: string) => {
    if (!isDesktopApp() || !activeTabId) return;

    if (lastSyncedPath.current === pathname) return;
    lastSyncedPath.current = pathname;

    const title = getRouteTitle(pathname);
    navigateTab(activeTabId, pathname, title);
  }, [activeTabId, navigateTab]);

  useEffect(() => {
    if (!isDesktopApp()) return;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    syncRouteToActiveTab(location.pathname);
  }, [location.pathname, syncRouteToActiveTab]);

  return {
    syncRouteToActiveTab,
  };
};
