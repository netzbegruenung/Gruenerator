import { useLocation } from 'react-router-dom';

export const useSharedContent = () => {
  const location = useLocation();

  const getInitialContent = () => {
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
    if (location.state?.thema || location.state?.details) {
      return {
        thema: location.state.thema || '',
        details: location.state.details || '',
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
