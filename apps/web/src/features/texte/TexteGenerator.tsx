import React, { useEffect, Suspense, lazy, useMemo, memo, useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import LoginRequired from '../../components/common/LoginRequired/LoginRequired';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useOptimizedAuth } from '../../hooks/useAuth';
import { useAuthStore } from '../../stores/authStore';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { useProfileData } from '../../stores/profileStore';

import TabSelector from './components/TabSelector';
import { useTabPersistence } from './hooks/useTabPersistence';
import { type TabId, type UniversalSubType } from './types';
import './components/TabSelector.css';

// Tabs that are accessible without login
const PUBLIC_TABS: TabId[] = ['presse-social'];

const TexteTab = lazy(() => import('./tabs/TexteTab'));
const PresseSocialTab = lazy(() => import('./tabs/PresseSocialTab'));
const AntragTab = lazy(() => import('./tabs/AntragTab'));
const UniversalTab = lazy(() => import('./tabs/UniversalTab'));
const BarrierefreiheitTab = lazy(() => import('./tabs/BarrierefreiheitTab'));
const TextEditorTab = lazy(() => import('./tabs/TextEditorTab'));
const EigeneTab = lazy(() => import('./tabs/EigeneTab'));

interface TexteGeneratorProps {
  showHeaderFooter?: boolean;
}

const LEGACY_ROUTE_MAP: Record<string, TabId> = {
  '/presse-social': 'presse-social',
  '/antrag': 'antrag',
  '/universal': 'universal',
  '/rede': 'universal',
  '/wahlprogramm': 'universal',
  '/buergerinnenanfragen': 'universal',
  '/barrierefreiheit': 'barrierefreiheit',
  '/texteditor': 'texteditor',
};

const LOADING_FALLBACK_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '400px',
  color: 'var(--font-color-secondary)',
};

const LoadingFallback = memo(() => (
  <div style={LOADING_FALLBACK_STYLE}>
    <div className="loading-spinner" />
  </div>
));
LoadingFallback.displayName = 'LoadingFallback';

const TAB_COMPONENT_NAMES: Record<TabId, string> = {
  texte: 'texte-generator',
  'presse-social': 'presse-social',
  antrag: 'antrag-generator',
  universal: 'universal-text',
  barrierefreiheit: 'accessibility-generator',
  texteditor: 'text-editor',
  eigene: 'eigene-generators',
};

/**
 * TexteGenerator - Main text generation interface with tabbed navigation.
 *
 * Uses the generic TabbedLayout for structure but with custom TabSelector
 * for specialized features like dropdown menus and auth-locked tabs.
 */
const TexteGenerator: React.FC<TexteGeneratorProps> = ({ showHeaderFooter = true }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeTab, setActiveTab } = useTabPersistence();
  const generatedTexts = useGeneratedTextStore((state) => state.generatedTexts);
  const profile = useProfileData();
  const user = useAuthStore((state) => state.user);
  const [universalSubType, setUniversalSubType] = useState<UniversalSubType>('rede');

  const { isAuthenticated, loading: authLoading } = useOptimizedAuth();

  const requiresAuth = !PUBLIC_TABS.includes(activeTab);
  const showLoginRequired = requiresAuth && !isAuthenticated && !authLoading;

  const firstName = useMemo(() => {
    if (profile?.first_name) return profile.first_name;
    if (user?.display_name) return user.display_name.split(' ')[0];
    if (user?.name) return user.name.split(' ')[0];
    return null;
  }, [profile?.first_name, user?.display_name, user?.name]);

  const hasGeneratedContent = useMemo(() => {
    return Object.values(TAB_COMPONENT_NAMES).some((componentName) => {
      const content = generatedTexts[componentName];
      if (!content) return false;
      if (typeof content === 'string') return content.trim().length > 0;
      return Object.keys(content).length > 0;
    });
  }, [generatedTexts]);

  useEffect(() => {
    const legacyTab = LEGACY_ROUTE_MAP[location.pathname];
    if (legacyTab && location.pathname !== '/texte') {
      navigate(`/texte?tab=${legacyTab}`, { replace: true });
    }
  }, [location.pathname, navigate]);

  const handleTabChange = useCallback(
    (tab: TabId) => {
      setActiveTab(tab);
    },
    [setActiveTab]
  );

  const handleUniversalSubTypeChange = useCallback((subType: UniversalSubType) => {
    setUniversalSubType(subType);
  }, []);

  const wrapperClassName = useMemo(
    () =>
      ['tabbed-layout', hasGeneratedContent && 'tabbed-layout--full-width'].filter(Boolean).join(' '),
    [hasGeneratedContent]
  );

  const headerClassName = useMemo(
    () =>
      ['tabbed-layout__header', hasGeneratedContent && 'tabbed-layout__header--compact']
        .filter(Boolean)
        .join(' '),
    [hasGeneratedContent]
  );

  // Build tab content map for the layout
  const tabContent = useMemo(
    () => ({
      texte: <TexteTab isActive={activeTab === 'texte'} />,
      'presse-social': <PresseSocialTab isActive={activeTab === 'presse-social'} />,
      antrag: <AntragTab isActive={activeTab === 'antrag'} />,
      universal: (
        <UniversalTab isActive={activeTab === 'universal'} selectedType={universalSubType} />
      ),
      barrierefreiheit: <BarrierefreiheitTab isActive={activeTab === 'barrierefreiheit'} />,
      texteditor: <TextEditorTab isActive={activeTab === 'texteditor'} />,
      eigene: <EigeneTab isActive={activeTab === 'eigene'} />,
    }),
    [activeTab, universalSubType]
  );

  return (
    <ErrorBoundary>
      <div className={wrapperClassName}>
        <header className={headerClassName}>
          {!hasGeneratedContent && (
            <h1 className="texte-generator-title">
              Was möchtest du heute grünerieren{firstName ? `, ${firstName}` : ''}?
            </h1>
          )}
          <TabSelector
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onUniversalSubTypeChange={handleUniversalSubTypeChange}
            isAuthenticated={isAuthenticated}
          />
        </header>
        <div className="tabbed-layout__content">
          {showLoginRequired ? (
            <LoginRequired
              variant="fullpage"
              title="Anmeldung erforderlich"
              message="Melde dich an, um diese Funktion zu nutzen. Der Presse & Social Tab ist auch ohne Anmeldung verfügbar."
              onClose={() => setActiveTab('presse-social')}
            />
          ) : (
            <Suspense fallback={<LoadingFallback />}>
              {Object.entries(tabContent).map(([tabId, content]) => (
                <div key={tabId} className="tabbed-layout__panel" data-active={activeTab === tabId}>
                  {content}
                </div>
              ))}
            </Suspense>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default memo(TexteGenerator);
