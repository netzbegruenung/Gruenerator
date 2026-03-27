import { type JSX, Suspense } from 'react';
import { useLocation } from 'react-router-dom';

import { routes } from '../../config/routes';
import PageLayout from '../common/Layout/PageLayout';
import AppProviders from '../common/Providers/AppProviders';
import { type PreloadableComponent, useRouteCache } from '../hooks/useRouteCache';

import type { LayoutMode } from '../../config/routes';

interface RouteComponentProps {
  path: string;
  darkMode: boolean;
  toggleDarkMode: () => void;
  isSpecial?: boolean;
  layoutMode?: LayoutMode;
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
  layoutMode,
}: RouteComponentProps): JSX.Element | null => {
  const location = useLocation();

  const route = isSpecial
    ? (routes.special as RouteConfig[]).find((r) => r.path === path)
    : (routes.standard as RouteConfig[]).find((r) => r.path === path);

  // Call hook unconditionally (Rules of Hooks)
  const CachedComponent = useRouteCache(
    (route?.component ?? null) as unknown as PreloadableComponent
  );

  if (!route) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('Keine Route gefunden für:', path);
    }
    return null;
  }

  // Überprüfen, ob es sich um die CollabEditor-Route handelt
  // Der genaue Pfadstring muss mit dem in routes.js übereinstimmen
  const ComponentToRender =
    route.path === '/editor/collab/:documentId'
      ? route.component // Bypassing useRouteCache for CollabEditorPage
      : (CachedComponent ?? route.component);

  return (
    <AppProviders
      pathname={location.pathname}
      withSharepic={route.withSharepic}
      withForm={route.withForm}
    >
      <PageLayout darkMode={darkMode} toggleDarkMode={toggleDarkMode} layoutMode={layoutMode}>
        <Suspense fallback={<div />}>
          <ComponentToRender key={path} darkMode={darkMode} />
        </Suspense>
      </PageLayout>
    </AppProviders>
  );
};

export default RouteComponent;
