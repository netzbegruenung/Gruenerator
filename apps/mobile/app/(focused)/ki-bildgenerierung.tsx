import { Redirect } from 'expo-router';

import { route } from '../../types/routes';

/**
 * The old KI-Bild type picker. "KI-Bild" opens the Bild-Editor now (#4025).
 * This path stays forever: shipped binaries and links may still open it.
 */
export default function LegacyKiBildgenerierungRoute() {
  return <Redirect href={route('/(focused)/bild-editor')} />;
}
