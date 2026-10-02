import { Redirect } from 'expo-router';

import { route } from '../../../types/routes';

/**
 * The old sharepic gallery. Saved images are listed on Arbeiten now (#4025).
 * This path stays forever: shipped binaries and links may still open it.
 */
export default function LegacyImageStudioGalleryRoute() {
  return <Redirect href={route('/start')} />;
}
