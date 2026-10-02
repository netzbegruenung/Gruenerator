import { Redirect } from 'expo-router';

import { route } from '../../../types/routes';

/**
 * Every step of the old Image Studio flow. Images are made in the Bild-Editor now (#4025).
 * This path stays forever: shipped binaries and links may still open it.
 */
export default function LegacyImageStudioCreateRoute() {
  return <Redirect href={route('/(focused)/bild-editor')} />;
}
