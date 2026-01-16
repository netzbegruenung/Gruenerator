import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { type TabId, DEFAULT_TAB, TAB_CONFIGS } from '../types';

interface UseTabPersistenceReturn {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  isValidTab: (tab: string) => tab is TabId;
}

const VALID_TAB_IDS = TAB_CONFIGS.map(config => config.id);

export function useTabPersistence(defaultTab: TabId = DEFAULT_TAB): UseTabPersistenceReturn {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const isValidTab = useCallback((tab: string): tab is TabId => {
    return VALID_TAB_IDS.includes(tab as TabId);
  }, []);

  const activeTab = useMemo((): TabId => {
    const tabFromUrl = searchParams.get('tab');

    if (tabFromUrl && isValidTab(tabFromUrl)) {
      return tabFromUrl;
    }

    const pathToTab: Record<string, TabId> = {
      '/presse-social': 'presse-social',
      '/antrag': 'antrag',
      '/universal': 'universal',
      '/rede': 'universal',
      '/wahlprogramm': 'universal',
      '/buergerinnenanfragen': 'universal'
    };

    const tabFromPath = pathToTab[location.pathname];
    if (tabFromPath) {
      return tabFromPath;
    }

    return defaultTab;
  }, [searchParams, location.pathname, defaultTab, isValidTab]);

  const setActiveTab = useCallback((tab: TabId) => {
    if (!isValidTab(tab)) return;

    if (location.pathname !== '/texte') {
      navigate(`/texte?tab=${tab}`, { replace: true });
    } else {
      setSearchParams({ tab }, { replace: true });
    }
  }, [navigate, setSearchParams, location.pathname, isValidTab]);

  return {
    activeTab,
    setActiveTab,
    isValidTab
  };
}

export default useTabPersistence;
