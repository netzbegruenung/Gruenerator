import React, { Suspense, lazy, useMemo, memo, useCallback, useState, useEffect } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import LoginRequired from '../../components/common/LoginRequired/LoginRequired';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useOptimizedAuth } from '../../hooks/useAuth';
import { useAuthStore } from '../../stores/authStore';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { useProfileData } from '../../stores/profileStore';

import TabSelector from './components/TabSelector';
import PresseSocialTab from './tabs/PresseSocialTab';
import { type TabId, type UniversalSubType } from './types';

import { cn } from '@/utils/cn';

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
const AntragTab = lazy(() => import('./tabs/AntragTab'));
const UniversalTab = lazy(() => import('./tabs/UniversalTab'));
const BarrierefreiheitTab = lazy(() => import('./tabs/BarrierefreiheitTab'));
const TextEditorTab = lazy(() => import('./tabs/TextEditorTab'));
const EigeneTab = lazy(() => import('./tabs/EigeneTab'));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TAB_COMPONENTS: Record<
  TabId,
  React.LazyExoticComponent<React.ComponentType<any>> | React.ComponentType<any>
> = {
  texte: TexteTab,
  'presse-social': PresseSocialTab,
  antrag: AntragTab,
  universal: UniversalTab,
  barrierefreiheit: BarrierefreiheitTab,
  texteditor: TextEditorTab,
  eigene: EigeneTab,
};

// Preload tab chunks on hover/focus — import() is idempotent (returns cached promise)
export const TAB_PRELOADERS: Record<TabId, () => void> = {
  texte: () => import('./tabs/TexteTab'),
  'presse-social': () => import('./tabs/PresseSocialTab'),
  antrag: () => import('./tabs/AntragTab'),
  universal: () => import('./tabs/UniversalTab'),
  barrierefreiheit: () => import('./tabs/BarrierefreiheitTab'),
  texteditor: () => import('./tabs/TextEditorTab'),
  eigene: () => import('./tabs/EigeneTab'),
};

const LoadingFallback = memo(() => (
  <div className="flex items-center justify-center min-h-[400px] text-foreground-muted">
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

  // Preload all lazy tab chunks on mount so they're ready before the user clicks
  useEffect(() => {
    Object.values(TAB_PRELOADERS).forEach((preload) => preload());
  }, []);

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

  // Track visited tabs — mount on first visit, keep mounted after (Activity pattern)
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(() => new Set([activeTab]));

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <ErrorBoundary>
      <div
        className={cn(
          'tabbed-layout w-full flex flex-col items-center overflow-x-hidden pt-2xl',
          'max-md:px-md max-md:pt-lg',
          'max-[400px]:px-sm max-[400px]:pt-md'
        )}
      >
        <header
          className={cn(
            'tabbed-layout__header w-full max-w-[800px] flex flex-col items-center gap-md px-md pb-lg box-border',
            'xl:max-w-[1000px] 3xl:max-w-[1100px]',
            'max-md:px-sm max-md:pb-md max-md:gap-sm',
            'max-[400px]:px-xs max-[400px]:pb-sm',
            hasGeneratedContent && 'pb-sm gap-0 max-md:pb-xs max-[400px]:pb-xxs'
          )}
        >
          {!hasGeneratedContent && (
            <h1 className="m-0 mb-lg text-[2.2rem] font-semibold text-foreground text-center max-md:text-[1.8rem] max-[400px]:text-[1.5rem]">
              Was möchtest du heute grünerieren{firstName ? `, ${firstName}` : ''}?
            </h1>
          )}
          <TabSelector
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onUniversalSubTypeChange={handleUniversalSubTypeChange}
            selectedUniversalSubType={universalSubType}
            isAuthenticated={isAuthenticated}
            onPreload={(tabId) => TAB_PRELOADERS[tabId]?.()}
          />
        </header>
        <div
          id={`tabpanel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
          className={cn(
            'w-full max-w-[800px] mx-auto grid grid-cols-1 grid-rows-1',
            'xl:max-w-[1000px] 3xl:max-w-[1100px]',
            'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-[-2px] focus-visible:rounded-lg',
            hasGeneratedContent && 'max-w-full xl:max-w-full 3xl:max-w-full px-lg max-md:px-0'
          )}
        >
          {showLoginRequired ? (
            <LoginRequired
              variant="fullpage"
              title="Anmeldung erforderlich"
              message="Melde dich an, um diese Funktion zu nutzen. Der Presse & Social Tab ist auch ohne Anmeldung verfügbar."
              onClose={() => navigate('/texte/presse-social')}
            />
          ) : (
            Object.entries(TAB_COMPONENTS).map(([tabId, TabComponent]) => {
              if (!visitedTabs.has(tabId as TabId)) return null;
              const isActive = tabId === activeTab;
              return (
                <div key={tabId} className={isActive ? undefined : 'hidden'}>
                  <Suspense fallback={<LoadingFallback />}>
                    {tabId === 'universal' ? (
                      <TabComponent selectedType={universalSubType} />
                    ) : (
                      <TabComponent />
                    )}
                  </Suspense>
                </div>
              );
            })
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default memo(TexteGenerator);
