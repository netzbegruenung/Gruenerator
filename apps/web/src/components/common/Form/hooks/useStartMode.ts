import { useEffect } from 'react';

interface UseStartModeParams {
  useStartPageLayout: boolean;
  hasAnyContent: boolean;
  storeIsFormVisible?: boolean;
  toggleStoreFormVisibility?: () => void;
  fallbackFormVisibility: {
    isFormVisible: boolean;
    toggleFormVisibility: () => void;
  };
  setIsStartMode: (isStartMode: boolean) => void;
}

export function useStartMode(params: UseStartModeParams) {
  const {
    useStartPageLayout,
    hasAnyContent,
    storeIsFormVisible,
    toggleStoreFormVisibility,
    fallbackFormVisibility,
    setIsStartMode: setStoreIsStartMode
  } = params;

  const isStartMode = useStartPageLayout && !hasAnyContent;
  const isFormVisible = storeIsFormVisible !== undefined ? storeIsFormVisible : fallbackFormVisibility.isFormVisible;
  const toggleFormVisibility = toggleStoreFormVisibility || fallbackFormVisibility.toggleFormVisibility;

  // Sync isStartMode to store for child components
  useEffect(() => {
    setStoreIsStartMode(isStartMode);
  }, [isStartMode, setStoreIsStartMode]);

  return {
    isStartMode,
    isFormVisible,
    toggleFormVisibility
  };
}
