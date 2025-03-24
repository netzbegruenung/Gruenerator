import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const useNavigationWarning = (hasContent) => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasContent) {
        const message = 'Wenn Sie diese Seite verlassen, gehen Ihre Änderungen verloren. Möchten Sie die Seite wirklich verlassen?';
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasContent]);

  useEffect(() => {
    if (!hasContent) return;

    const unlisten = navigate((to) => {
      if (to.pathname === location.pathname) return true;

      const userConfirmed = window.confirm(
        'Wenn Sie diese Seite verlassen, gehen Ihre Änderungen verloren. Möchten Sie die Seite wirklich verlassen?'
      );

      if (userConfirmed) {
        return true;
      }
      
      return false;
    });

    return () => unlisten?.();
  }, [hasContent, location.pathname, navigate]);

  return null;
};

export default useNavigationWarning; 