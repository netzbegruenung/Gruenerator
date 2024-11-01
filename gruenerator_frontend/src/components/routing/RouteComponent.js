import React, { Suspense } from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import AppProviders from '../common/Providers/AppProviders';
import PageLayout from '../common/Layout/PageLayout';
import { routes } from '../../config/routes';
import { useRouteCache } from '../hooks/useRouteCache';

const RouteComponent = ({ 
  path, 
  darkMode, 
  toggleDarkMode, 
  isSpecial = false,
  showHeaderFooter = true 
}) => {
  const location = useLocation();
  
  const route = isSpecial 
    ? routes.special.find(r => r.path === path)
    : routes.standard.find(r => r.path === path);

  if (!route) return null;

  const CachedComponent = useRouteCache(route.component);

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
        <div style={{ minHeight: '100vh' }}>
          <Suspense fallback={null}>
            <CachedComponent 
              key={path}
              darkMode={darkMode}
              showHeaderFooter={showHeaderFooter}
            />
          </Suspense>
        </div>
      </PageLayout>
    </AppProviders>
  );
};

RouteComponent.propTypes = {
  path: PropTypes.string.isRequired,
  darkMode: PropTypes.bool.isRequired,
  toggleDarkMode: PropTypes.func.isRequired,
  isSpecial: PropTypes.bool,
  showHeaderFooter: PropTypes.bool
};

export default RouteComponent;