import { useLocation } from 'react-router-dom';

interface SharedContent {
  thema: string;
  details: string;
  isFromSharepic: boolean;
}

interface LocationState {
  thema?: string;
  details?: string;
}

interface UseSharedContentReturn {
  initialContent: SharedContent;
}

export const useSharedContent = (): UseSharedContentReturn => {
  const location = useLocation();

  const getInitialContent = (): SharedContent => {
    // Prüfe URL-Parameter
    const urlParams = new URLSearchParams(window.location.search);
    const themaFromUrl = urlParams.get('thema');
    const detailsFromUrl = urlParams.get('details');

    // Wenn URL-Parameter vorhanden sind, nutze diese
    if (themaFromUrl || detailsFromUrl) {
      return {
        thema: themaFromUrl || '',
        details: detailsFromUrl || '',
        isFromSharepic: true,
      };
    }

    // Ansonsten prüfe Router-State
    const state = location.state as LocationState | null;
    if (state?.thema || state?.details) {
      return {
        thema: state.thema || '',
        details: state.details || '',
        isFromSharepic: true,
      };
    }

    // Fallback: leere Werte
    return {
      thema: '',
      details: '',
      isFromSharepic: false,
    };
  };

  return {
    initialContent: getInitialContent(),
  };
};
