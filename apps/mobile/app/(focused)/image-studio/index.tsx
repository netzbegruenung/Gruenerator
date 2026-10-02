import { Redirect } from 'expo-router';

import { route } from '../../../types/routes';

/**
 * The old Image Studio start. Images are made in the Bild-Editor now (#4025).
 * This path stays forever: shipped binaries and links may still open it.
 */
export default function LegacyImageStudioRoute() {
  return <Redirect href={route('/(focused)/bild-editor')} />;
}
