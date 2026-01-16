import React, { useEffect, Suspense, lazy, useMemo, memo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ErrorBoundary from '../../components/ErrorBoundary';
import TabSelector from './components/TabSelector';
import { useTabPersistence } from './hooks/useTabPersistence';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { type TabId } from './types';
import './components/TabSelector.css';

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
  '/texteditor': 'texteditor'
};

const LOADING_FALLBACK_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '400px',
  color: 'var(--font-color-secondary)'
};

const LoadingFallback = memo(() => (
  <div style={LOADING_FALLBACK_STYLE}>
    <div className="loading-spinner" />
  </div>
));
LoadingFallback.displayName = 'LoadingFallback';

const TAB_COMPONENT_NAMES: Record<TabId, string> = {
  'texte': 'texte-generator',
  'presse-social': 'presse-social',
  'antrag': 'antrag-generator',
  'universal': 'universal-text',
  'barrierefreiheit': 'accessibility-generator',
  'texteditor': 'text-editor',
  'eigene': 'eigene-generators'
};

const TexteGenerator: React.FC<TexteGeneratorProps> = ({ showHeaderFooter = true }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeTab, setActiveTab } = useTabPersistence();
  const generatedTexts = useGeneratedTextStore((state) => state.generatedTexts);

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

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
  }, [setActiveTab]);

  const wrapperClassName = useMemo(
    () => `texte-generator-wrapper ${hasGeneratedContent ? 'has-content' : ''}`,
    [hasGeneratedContent]
  );

  const headerClassName = useMemo(
    () => `texte-generator-header ${hasGeneratedContent ? 'compact' : ''}`,
    [hasGeneratedContent]
  );

  return (
    <ErrorBoundary>
      <div className={wrapperClassName}>
        <header className={headerClassName}>
          {!hasGeneratedContent && (
            <h1 className="texte-generator-title">Was möchtest du heute grünerieren?</h1>
          )}
          <TabSelector
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        </header>
        <div className="texte-generator-content">
          <Suspense fallback={<LoadingFallback />}>
            <TexteTab isActive={activeTab === 'texte'} />
            <PresseSocialTab isActive={activeTab === 'presse-social'} />
            <AntragTab isActive={activeTab === 'antrag'} />
            <UniversalTab isActive={activeTab === 'universal'} />
            <BarrierefreiheitTab isActive={activeTab === 'barrierefreiheit'} />
            <TextEditorTab isActive={activeTab === 'texteditor'} />
            <EigeneTab isActive={activeTab === 'eigene'} />
          </Suspense>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default memo(TexteGenerator);
