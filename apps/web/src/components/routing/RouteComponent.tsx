import { type JSX, Suspense, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { routes } from '../../config/routes';
import PageLayout from '../common/Layout/PageLayout';
import AppProviders from '../common/Providers/AppProviders';
import { useRouteCache } from '../hooks/useRouteCache';

interface RouteComponentProps {
  path: string;
  darkMode: boolean;
  toggleDarkMode: () => void;
  isSpecial?: boolean;
  showHeaderFooter?: boolean;
}

interface RouteConfig {
  path: string;
  component: React.LazyExoticComponent<React.ComponentType<unknown>>;
  withSharepic?: boolean;
  withForm?: boolean;
}

const RouteComponent = ({
  path,
  darkMode,
  toggleDarkMode,
  isSpecial = false,
  showHeaderFooter = true,
}: RouteComponentProps): JSX.Element | null => {
  const location = useLocation();

  // Route debugging effect removed to reduce console noise

  // Finde die passende Route
  let route: RouteConfig | undefined;
  if (!showHeaderFooter) {
    route = (routes.noHeaderFooter as RouteConfig[]).find((r) => r.path === path);
    // No-Header-Footer Route found
  } else {
    route = isSpecial
      ? (routes.special as RouteConfig[]).find((r) => r.path === path)
      : (routes.standard as RouteConfig[]).find((r) => r.path === path);
  }

  if (!route) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('Keine Route gefunden für:', path);
    }
    return null;
  }

  let ComponentToRender;
  // Überprüfen, ob es sich um die CollabEditor-Route handelt
  // Der genaue Pfadstring muss mit dem in routes.js übereinstimmen
  if (route.path === '/editor/collab/:documentId') {
    // Bypassing useRouteCache for CollabEditorPage
    ComponentToRender = route.component; // Direkt die lazy Komponente verwenden
  } else {
    ComponentToRender = useRouteCache(route.component);
  }

  return (
    <AppProviders
      pathname={location.pathname}
      withSharepic={route.withSharepic}
      withForm={route.withForm}
    >
      <PageLayout
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        showHeaderFooter={showHeaderFooter}
      >
        <div>
          <Suspense fallback={<div />}>
            <ComponentToRender key={path} darkMode={darkMode} showHeaderFooter={showHeaderFooter} />
          </Suspense>
        </div>
      </PageLayout>
    </AppProviders>
  );
};

export default RouteComponent;
