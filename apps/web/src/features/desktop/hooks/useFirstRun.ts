import { useState, useEffect, useCallback } from 'react';

const FIRST_RUN_CONFIG = {
  REQUIRE_LOGIN: false,
  STORAGE_KEY: 'gruenerator_desktop_first_run_completed',
  VERSION_KEY: 'gruenerator_desktop_version'
};

interface UseFirstRunReturn {
  isFirstRun: boolean;
  requireLogin: boolean;
  completeFirstRun: () => void;
  resetFirstRun: () => void;
}

export function useFirstRun(): UseFirstRunReturn {
  const [isFirstRun, setIsFirstRun] = useState<boolean>(false);

  useEffect(() => {
    const completed = localStorage.getItem(FIRST_RUN_CONFIG.STORAGE_KEY);
    const savedVersion = localStorage.getItem(FIRST_RUN_CONFIG.VERSION_KEY);
    const currentVersion = '1.0.0';

    const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

    if (!isTauri) {
      setIsFirstRun(false);
      return;
    }

    if (!completed || savedVersion !== currentVersion) {
      setIsFirstRun(true);
    } else {
      setIsFirstRun(false);
    }
  }, []);

  const completeFirstRun = useCallback(() => {
    localStorage.setItem(FIRST_RUN_CONFIG.STORAGE_KEY, 'true');
    localStorage.setItem(FIRST_RUN_CONFIG.VERSION_KEY, '1.0.0');
    setIsFirstRun(false);

    if (typeof window !== 'undefined' && '__TAURI__' in window) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('close_splashscreen').catch(console.error);
      });
    }
  }, []);

  const resetFirstRun = useCallback(() => {
    localStorage.removeItem(FIRST_RUN_CONFIG.STORAGE_KEY);
    localStorage.removeItem(FIRST_RUN_CONFIG.VERSION_KEY);
    setIsFirstRun(true);
  }, []);

  return {
    isFirstRun,
    requireLogin: FIRST_RUN_CONFIG.REQUIRE_LOGIN,
    completeFirstRun,
    resetFirstRun
  };
}

export default useFirstRun;
