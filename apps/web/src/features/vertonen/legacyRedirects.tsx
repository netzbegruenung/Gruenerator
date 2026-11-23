import { Navigate, useLocation } from 'react-router-dom';

import { type VertonenMode } from './modes';

function createModeRedirect(modus: VertonenMode) {
  return function ModeRedirect() {
    const { search } = useLocation();
    const params = new URLSearchParams(search);
    params.set('modus', modus);
    return <Navigate to={{ pathname: '/vertonen', search: `?${params.toString()}` }} replace />;
  };
}

/** `/voice` is F0: it keeps working and opens the shared page in „Text → Audio". */
export const VoiceRedirect = createModeRedirect('text-zu-audio');

/** `/transkription` is F0: it keeps working and opens the shared page in „Audio → Text". */
export const TranskriptionRedirect = createModeRedirect('audio-zu-text');
