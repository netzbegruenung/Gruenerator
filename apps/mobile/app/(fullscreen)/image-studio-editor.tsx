import { Redirect } from 'expo-router';

import { route } from '../../types/routes';

/**
 * The old Image Studio editor. Images are edited in the Bild-Editor now (#4025).
 * This path stays forever: shipped binaries and links may still open it.
 */
export default function LegacyImageStudioEditorRoute() {
  return <Redirect href={route('/(focused)/bild-editor')} />;
}
