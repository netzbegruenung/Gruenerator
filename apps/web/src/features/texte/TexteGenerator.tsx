import React, { Suspense, lazy, useMemo, memo, useCallback } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import LoginRequired from '../../components/common/LoginRequired/LoginRequired';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useOptimizedAuth } from '../../hooks/useAuth';
import { useAuthStore } from '../../stores/authStore';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { useProfileData } from '../../stores/profileStore';

import TabSelector from './components/TabSelector';
import { type TabId, type UniversalSubType } from './types';
import './components/TabSelector.css';

// Tabs that are accessible without login
const PUBLIC_TABS: TabId[] = ['presse-social'];

const VALID_TABS: TabId[] = [
  'texte',
  'presse-social',
  'antrag',
  'universal',
  'barrierefreiheit',
  'texteditor',
  'eigene',
];

const VALID_UNIVERSAL_SUB_TYPES: UniversalSubType[] = [
  'rede',
  'wahlprogramm',
  'buergeranfragen',
  'leichte_sprache',
];

const TexteTab = lazy(() => import('./tabs/TexteTab'));
const PresseSocialTab = lazy(() => import('./tabs/PresseSocialTab'));
const AntragTab = lazy(() => import('./tabs/AntragTab'));
const UniversalTab = lazy(() => import('./tabs/UniversalTab'));
const BarrierefreiheitTab = lazy(() => import('./tabs/BarrierefreiheitTab'));
const TextEditorTab = lazy(() => import('./tabs/TextEditorTab'));
const EigeneTab = lazy(() => import('./tabs/EigeneTab'));

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

const UNIVERSAL_SUB_TYPES = ['rede', 'wahlprogramm', 'buergeranfragen', 'leichte_sprache'];

// Map legacy ?tab= values to new path segments
const LEGACY_TAB_TO_PATH: Record<string, string> = {
  texte: '/texte/texte',
  'presse-social': '/texte/presse-social',
  antrag: '/texte/antrag',
  universal: '/texte/universal/rede',
  barrierefreiheit: '/texte/barrierefreiheit',
  texteditor: '/texte/texteditor',
  eigene: '/texte/eigene',
};

/**
 * TexteGenerator - Main text generation interface with route-based tab navigation.
 *
 * URL structure:
 *   /texte                           → redirect to /texte/presse-social
 *   /texte/texte                     → TexteTab
 *   /texte/presse-social             → PresseSocialTab (default, public)
 *   /texte/antrag                    → AntragTab
 *   /texte/universal                 → redirect to /texte/universal/rede
 *   /texte/universal/<subtype>       → UniversalTab
 *   /texte/barrierefreiheit          → BarrierefreiheitTab
 *   /texte/texteditor                → TextEditorTab
 *   /texte/eigene                    → EigeneTab
 */
const TexteGenerator: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const generatedTexts = useGeneratedTextStore((state) => state.generatedTexts);
  const profile = useProfileData();
  const user = useAuthStore((state) => state.user);

  const { isAuthenticated, loading: authLoading } = useOptimizedAuth();

  // Parse the splat (everything after /texte/) into activeTab + universalSubType
  // Compute redirectTo without early returns so hooks below remain unconditional
  const splat = params['*'] || '';
  const segments = splat.split('/').filter(Boolean);
  const legacyTab = searchParams.get('tab');

  let redirectTo: string | null = null;
  let activeTab: TabId = 'presse-social';
  let universalSubType: UniversalSubType = 'rede';

  if (legacyTab && LEGACY_TAB_TO_PATH[legacyTab]) {
    redirectTo = LEGACY_TAB_TO_PATH[legacyTab];
  } else if (segments.length === 0) {
    redirectTo = '/texte/presse-social';
  } else {
    const firstSegment = segments[0] as TabId;
    if (!VALID_TABS.includes(firstSegment)) {
      redirectTo = '/texte/presse-social';
    } else {
      activeTab = firstSegment;
      if (activeTab === 'universal' && segments.length === 1) {
        redirectTo = '/texte/universal/rede';
      } else if (activeTab === 'universal' && segments.length >= 2) {
        universalSubType = VALID_UNIVERSAL_SUB_TYPES.includes(segments[1] as UniversalSubType)
          ? (segments[1] as UniversalSubType)
          : 'rede';
      }
    }
  }

  const requiresAuth = !PUBLIC_TABS.includes(activeTab);
  const showLoginRequired = requiresAuth && !isAuthenticated && !authLoading;

  const firstName = useMemo(() => {
    if (profile?.first_name) return profile.first_name;
    if (user?.display_name) return user.display_name.split(' ')[0];
    if (user?.name) return user.name.split(' ')[0];
    return null;
  }, [profile?.first_name, user?.display_name, user?.name]);

  const hasGeneratedContent = useMemo(() => {
    const baseCheck = Object.values(TAB_COMPONENT_NAMES).some((componentName) => {
      const content = generatedTexts[componentName];
      if (!content) return false;
      if (typeof content === 'string') return content.trim().length > 0;
      return Object.keys(content).length > 0;
    });
    if (baseCheck) return true;
    return UNIVERSAL_SUB_TYPES.some((subType) => {
      const content = generatedTexts[`universal-text-${subType}`];
      if (!content) return false;
      if (typeof content === 'string') return content.trim().length > 0;
      return Object.keys(content).length > 0;
    });
  }, [generatedTexts]);

  const handleTabChange = useCallback(
    (tab: TabId) => {
      if (tab === 'universal') {
        navigate('/texte/universal/rede');
      } else {
        navigate(`/texte/${tab}`);
      }
    },
    [navigate]
  );

  const handleUniversalSubTypeChange = useCallback(
    (subType: UniversalSubType) => {
      navigate(`/texte/universal/${subType}`);
    },
    [navigate]
  );

  const wrapperClassName = useMemo(
    () =>
      ['tabbed-layout', hasGeneratedContent && 'tabbed-layout--full-width']
        .filter(Boolean)
        .join(' '),
    [hasGeneratedContent]
  );

  const headerClassName = useMemo(
    () =>
      ['tabbed-layout__header', hasGeneratedContent && 'tabbed-layout__header--compact']
        .filter(Boolean)
        .join(' '),
    [hasGeneratedContent]
  );

  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  // Render only the active tab (conditional rendering replaces grid stacking)
  const renderActiveTab = () => {
    switch (activeTab) {
      case 'texte':
        return <TexteTab />;
      case 'presse-social':
        return <PresseSocialTab />;
      case 'antrag':
        return <AntragTab />;
      case 'universal':
        return <UniversalTab selectedType={universalSubType} />;
      case 'barrierefreiheit':
        return <BarrierefreiheitTab />;
      case 'texteditor':
        return <TextEditorTab />;
      case 'eigene':
        return <EigeneTab />;
      default:
        return <PresseSocialTab />;
    }
  };

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
            selectedUniversalSubType={universalSubType}
            isAuthenticated={isAuthenticated}
          />
        </header>
        <div
          id={`tabpanel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
          className="tabbed-layout__content"
        >
          {showLoginRequired ? (
            <LoginRequired
              variant="fullpage"
              title="Anmeldung erforderlich"
              message="Melde dich an, um diese Funktion zu nutzen. Der Presse & Social Tab ist auch ohne Anmeldung verfügbar."
              onClose={() => navigate('/texte/presse-social')}
            />
          ) : (
            <Suspense fallback={<LoadingFallback />}>{renderActiveTab()}</Suspense>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default memo(TexteGenerator);
